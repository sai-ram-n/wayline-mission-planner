#!/usr/bin/env bash
# End-to-end smoke test for the Wayline Mission Planner API.
# Start the backend first (npm run dev), then: bash backend/test/api-smoke.sh
# Creates and removes its own data; leaves the database as it found it.

API=localhost:3001/api
HERE="$(cd "$(dirname "$0")" && pwd)"
S="python3 $HERE/_format.py"
p() { echo; echo "### $1"; }

p "CREATE wayline with 3 waypoints + actions"
CREATED=$(curl -s -X POST $API/waylines -H 'Content-Type: application/json' -d '{
  "name":"Warehouse Perimeter",
  "description":"Phase 1 smoke test",
  "route_type":"waypoint",
  "aircraft_series":"M30","aircraft_model":"M30T",
  "settings":{"autoFlightSpeed":8,"globalHeight":120,"heightMode":"ASL","finishAction":"goHome","lenses":["wide","ir"]},
  "waypoints":[
    {"lat":-37.8079,"lng":145.2841,"height":120,
     "actions":[{"action_type":"rotateYaw","params":{"aircraftHeading":90}},
                {"action_type":"gimbalTilt","params":{"angle":-45}},
                {"action_type":"takePhoto","params":{"fileSuffix":"corner-a","lenses":["wide"],"followRoute":false}}]},
    {"lat":-37.8069,"lng":145.2851,"height":130,"speed":6,"use_global_speed":false,"use_global_height":false,
     "actions":[{"action_type":"hover","params":{"hoverTime":15}}]},
    {"lat":-37.8059,"lng":145.2841,"height":120,"turn_mode":"coordinateTurn","use_global_turn":false,
     "actions":[{"action_type":"startRecord","params":{"followRoute":true}}]}
  ]}')
ID=$(echo "$CREATED" | $S id)
echo "id=$ID"
echo "$CREATED" | $S wayline

p "GET list (summary + path for thumbnails)"
curl -s $API/waylines | $S list

p "UPDATE -> 2 waypoints (delete+reinsert, transactional)"
curl -s -X PUT $API/waylines/$ID -H 'Content-Type: application/json' -d '{
  "name":"Warehouse Perimeter v2","description":"trimmed",
  "settings":{"autoFlightSpeed":12},
  "waypoints":[{"lat":-37.8079,"lng":145.2841,"height":100,"actions":[{"action_type":"panorama","params":{}}]},
               {"lat":-37.8069,"lng":145.2851,"height":110,"actions":[]}]}' | $S updated

p "Orphan check via direct SQL"
sqlite3 "$HERE/../data/wayline.sqlite" \
  "SELECT (SELECT COUNT(*) FROM waypoints WHERE wayline_id='$ID') AS wps,
          (SELECT COUNT(*) FROM waypoint_actions a JOIN waypoints w ON w.id=a.waypoint_id WHERE w.wayline_id='$ID') AS acts,
          (SELECT COUNT(*) FROM waypoint_actions WHERE waypoint_id NOT IN (SELECT id FROM waypoints)) AS orphaned;" 2>/dev/null \
  | awk -F'|' '{print "  waypoints="$1" actions="$2" orphaned_actions="$3}' || echo "  (sqlite3 CLI unavailable)"

p "DUPLICATE"
DUP=$(curl -s -X POST $API/waylines/$ID/duplicate -H 'Content-Type: application/json' -d '{}')
DUPID=$(echo "$DUP" | $S id)
echo "$DUP" | $S copy

p "VALIDATION"
curl -s -o /dev/null -w '  lat out of range     -> %{http_code}\n' -X POST $API/waylines -H 'Content-Type: application/json' -d '{"name":"x","waypoints":[{"lat":999,"lng":0,"height":10}]}'
curl -s -o /dev/null -w '  unknown action type  -> %{http_code}\n' -X POST $API/waylines -H 'Content-Type: application/json' -d '{"name":"x","waypoints":[{"lat":0,"lng":0,"height":10,"actions":[{"action_type":"nope"}]}]}'
curl -s -o /dev/null -w '  blank name           -> %{http_code}\n' -X POST $API/waylines -H 'Content-Type: application/json' -d '{"name":"  "}'
curl -s -o /dev/null -w '  speed above 15 m/s   -> %{http_code}\n' -X POST $API/waylines -H 'Content-Type: application/json' -d '{"name":"x","settings":{"autoFlightSpeed":99}}'
echo "  sample error body:"
curl -s -X POST $API/waylines -H 'Content-Type: application/json' -d '{"name":"x","waypoints":[{"lat":999,"lng":0,"height":10}]}' | head -c 220; echo

p "404s"
curl -s -o /dev/null -w '  missing wayline      -> %{http_code}\n' $API/waylines/00000000-0000-0000-0000-000000000000
curl -s -o /dev/null -w '  bogus path           -> %{http_code}\n' $API/nothing-here

p "ASSIGNMENTS: one wayline -> two drones"
D1=$(curl -s $API/drones | $S nthid 0)
D2=$(curl -s $API/drones | $S nthid 1)
curl -s -X POST $API/assignments -H 'Content-Type: application/json' -d "{\"wayline_id\":\"$ID\",\"drone_ids\":[\"$D1\",\"$D2\"]}" | $S assignments

p "Advance pending -> synced -> in_progress -> complete"
AID=$(curl -s $API/assignments | $S firstid)
for ST in synced in_progress complete; do
  curl -s -X PATCH $API/assignments/$AID -H 'Content-Type: application/json' -d "{\"status\":\"$ST\"}" | $S status
done
curl -s -o /dev/null -w '  invalid status       -> %{http_code}\n' -X PATCH $API/assignments/$AID -H 'Content-Type: application/json' -d '{"status":"exploded"}'
curl -s -o /dev/null -w '  unknown drone id     -> %{http_code}\n' -X POST $API/assignments -H 'Content-Type: application/json' -d "{\"wayline_id\":\"$ID\",\"drone_ids\":[\"00000000-0000-0000-0000-000000000000\"]}"

p "LOCK blocks edit + delete (lock is set via PATCH, never via PUT)"
curl -s -o /dev/null -w '  lock via PATCH       -> %{http_code} (want 200)\n' -X PATCH $API/waylines/$DUPID -H 'Content-Type: application/json' -d '{"locked":true}'
curl -s -o /dev/null -w '  PUT while locked     -> %{http_code} (want 409)\n' -X PUT $API/waylines/$DUPID -H 'Content-Type: application/json' -d '{"name":"try edit","waypoints":[]}'
curl -s -o /dev/null -w '  PATCH while locked   -> %{http_code} (want 409)\n' -X PATCH $API/waylines/$DUPID -H 'Content-Type: application/json' -d '{"name":"try rename"}'
curl -s -o /dev/null -w '  DELETE while locked  -> %{http_code} (want 409)\n' -X DELETE $API/waylines/$DUPID
curl -s -o /dev/null -w '  unlock via PATCH     -> %{http_code} (want 200)\n' -X PATCH $API/waylines/$DUPID -H 'Content-Type: application/json' -d '{"locked":false}'
curl -s -X PUT $API/waylines/$DUPID -H 'Content-Type: application/json' -d '{"name":"edited fine","waypoints":[]}' | python3 -c 'import sys,json;print("  PUT preserves unlocked state:",json.load(sys.stdin)["locked"],"(want False)")'

p "Cascade: deleting a wayline removes its assignments"
BEFORE=$(curl -s $API/assignments | $S len)
curl -s -o /dev/null -w '  delete wayline       -> %{http_code}\n' -X DELETE $API/waylines/$ID
AFTER=$(curl -s $API/assignments | $S len)
echo "  assignments: $BEFORE -> $AFTER"

p "Cleanup"
curl -s -o /dev/null -X DELETE $API/waylines/$DUPID
curl -s $API/waylines | $S len
