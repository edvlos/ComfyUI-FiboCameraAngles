"""Fibo Camera Angles: a camera-orbit widget that writes a plain-language
camera instruction for Fibo 2.0 Edit (TextEncodeFibo2)."""
from .camera_prompt import build, DEFAULT_KEEP


class FiboCameraAngles:
    CATEGORY = "conditioning/fibo"
    FUNCTION = "run"
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "camera_info")
    DESCRIPTION = ("Drag the camera around the subject to write a camera-angle instruction for Fibo 2.0 Edit. "
                   "Connect prompt to TextEncodeFibo2 (prompt) with the photo as image 1. "
                   "Angles are relative to the original camera: 0 = front, +90 = camera moves to the right, 180 = behind.")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "horizontal_angle": ("INT", {"default": 0, "min": -180, "max": 180, "step": 1,
                                             "tooltip": "0 front, +90 camera to the right, 180 behind, -90 to the left"}),
                "vertical_angle": ("INT", {"default": 0, "min": -90, "max": 90, "step": 1,
                                           "tooltip": "0 eye level, + camera above looking down, - camera below looking up"}),
                "zoom": ("FLOAT", {"default": 5.0, "min": 0.0, "max": 10.0, "step": 0.1,
                                   "tooltip": "0 extreme wide ... 5 full/medium ... 10 extreme close-up"}),
                "subject": ("STRING", {"default": "the person", "multiline": False,
                                       "tooltip": "How to call the subject: the person, the woman, the man, the car..."}),
                "subject_is_person": ("BOOLEAN", {"default": True,
                                                  "tooltip": "Shot sizes use body framing (waist up, face) for people"}),
                "keep": ("STRING", {"default": DEFAULT_KEEP, "multiline": True,
                                    "tooltip": "What must stay the same"}),
            },
            "optional": {
                "image": ("IMAGE", {"tooltip": "Optional: only used to show your photo on the camera view"}),
                "extra": ("STRING", {"default": "", "multiline": True, "forceInput": True,
                                     "tooltip": "Optional text appended to the prompt"}),
            },
        }

    def run(self, horizontal_angle, vertical_angle, zoom, subject, subject_is_person, keep, image=None, extra=""):
        prompt, info = build(horizontal_angle, vertical_angle, zoom, subject, keep, subject_is_person, extra or "")
        return {"ui": {"text": [prompt]}, "result": (prompt, info)}


NODE_CLASS_MAPPINGS = {"FiboCameraAngles": FiboCameraAngles}
NODE_DISPLAY_NAME_MAPPINGS = {"FiboCameraAngles": "Fibo Camera Angles"}
WEB_DIRECTORY = "./js"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
