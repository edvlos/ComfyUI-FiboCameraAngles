"""Turns camera angles into a plain-language camera instruction for Fibo 2.0 Edit.

Convention (relative to the original camera, like the QMA / multi-angle nodes):
  horizontal_angle  0 = front, +90 = camera orbits 90 deg to the right, 180 = behind, -90 = to the left
  vertical_angle    0 = eye level, + = camera above looking down, - = camera below looking up
  zoom              0 = very far (extreme wide) ... 10 = very close (extreme close-up), 5 = medium shot
"""
import json


def _wrap(a):
    a = float(a) % 360.0
    return a - 360.0 if a > 180.0 else a


def view_label(h):
    a = abs(h)
    side = "right" if h > 0 else "left"
    if a <= 15:
        return "front view"
    if a <= 65:
        return f"front-{side} three-quarter view"
    if a <= 115:
        return f"{side} side profile view"
    if a <= 165:
        return f"back-{side} three-quarter view"
    return "back view, seen from behind"


def elevation_label(v):
    if v <= -40:
        return "worm's-eye view from the ground, looking steeply up, the subject towering against the sky"
    if v <= -12:
        return "low-angle shot from below, the camera close to the ground looking up at the subject, more sky visible behind"
    if v < 12:
        return "eye-level shot"
    if v < 40:
        return "high-angle shot from above, the camera looking down at the subject, more of the ground visible around"
    if v < 70:
        return "bird's-eye view from high above, looking steeply down, the top of the head and the ground around clearly visible"
    return "top-down overhead shot from directly above, looking straight down"


def shot_label(z, subject_is_person=True):
    if z < 1.5:
        return "extreme wide shot, the subject small in a large environment"
    if z < 3.5:
        return "wide shot showing the full body and the surroundings" if subject_is_person else "wide shot showing the whole subject and the surroundings"
    if z < 5.5:
        return "full shot from head to toe" if subject_is_person else "full shot of the whole subject"
    if z < 7.0:
        return "medium shot from the waist up" if subject_is_person else "medium shot"
    if z < 8.5:
        return "medium close-up from the chest up" if subject_is_person else "medium close-up"
    if z < 9.5:
        return "close-up of the face" if subject_is_person else "close-up"
    return "extreme close-up of the face" if subject_is_person else "extreme close-up of a detail"


def build(horizontal_angle, vertical_angle, zoom, subject="the subject", keep="", person=True, extra=""):
    h = round(_wrap(horizontal_angle))
    v = max(-90, min(90, round(float(vertical_angle))))
    z = max(0.0, min(10.0, float(zoom)))
    subject = (subject or "the subject").strip()
    view, elev, shot = view_label(h), elevation_label(v), shot_label(z, person)

    moves = []
    if abs(h) > 5:
        if abs(h) >= 175:
            moves.append(f"orbit the camera 180 degrees around {subject} to the back")
        else:
            moves.append(f"orbit the camera {abs(h)} degrees to the {'right' if h > 0 else 'left'} around {subject}")
    if abs(v) >= 12:
        moves.append(f"raise the camera {abs(v)} degrees above {subject}" if v > 0
                     else f"lower the camera {abs(v)} degrees below {subject}'s eye level")
    move_txt = (" and ".join(moves) + ", ") if moves else ""

    prompt = (f"Change the camera angle: {move_txt}showing {subject} in a {view}, {elev}, {shot}. "
              f"{keep.strip()}").strip()
    if extra and extra.strip():
        prompt += " " + extra.strip()
    info = {"horizontal_angle": h, "vertical_angle": v, "zoom": round(z, 2), "view": view,
            "elevation": elev, "shot": shot}
    return prompt, json.dumps(info)


DEFAULT_KEEP = ("Keep the same person, face, hair, clothing, lighting and environment; "
                "only the camera viewpoint changes.")
