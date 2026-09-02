import sys, json
mode = sys.argv[1]
d = json.load(sys.stdin)

if mode == "wayline":
    print("  waypoints:", len(d["waypoints"]))
    for w in d["waypoints"]:
        acts = [a["action_type"] for a in w["actions"]]
        print("   #%s h=%s spd=%s turn=%s useGlobalSpeed=%s actions=%s"
              % (w["order_index"], w["height"], w["speed"], w["turn_mode"][:24],
                 w["use_global_speed"], acts))
    s = d["settings"]
    print("  settings sent:  autoFlightSpeed=%s lenses=%s" % (s["autoFlightSpeed"], s["lenses"]))
    print("  defaults merged: finishAction=%s gimbalPitchMode=%s turnMode=%s"
          % (s["finishAction"], s["gimbalPitchMode"], s["turnMode"][:24]))
elif mode == "id":
    print(d["id"])
elif mode == "list":
    for w in d:
        print("   %-28s wp=%-3s path_pts=%-3s model=%s"
              % (w["name"], w["waypoint_count"], len(w["path"]), w["aircraft_model"]))
elif mode == "updated":
    print("  name:", d["name"], "| waypoints:", len(d["waypoints"]),
          "| wp0 actions:", [a["action_type"] for a in d["waypoints"][0]["actions"]])
elif mode == "count":
    print("  waypoints now:", len(d["waypoints"]))
elif mode == "copy":
    print("  copy name:", d["name"], "| waypoints:", len(d["waypoints"]))
elif mode == "assignments":
    print("  created:", len(d))
    for a in d:
        print("    %s -> %s (%s) [%s]"
              % (a["wayline_name"], a["drone_name"], a["drone_model"], a["status"]))
elif mode == "status":
    print("   ->", d["status"])
elif mode == "len":
    print(len(d))
elif mode == "firstid":
    print(d[0]["id"])
elif mode == "nthid":
    print(d[int(sys.argv[2])]["id"])
