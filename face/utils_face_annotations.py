import os
from typing import List, Tuple, Dict

import cv2
import torch


def read_face_boxes_from_txt(annotation_txt_path: str, image_shape: Tuple[int, int]) -> List[List[float]]:
    """
    Read face boxes from a .txt file. Supports the following line formats per box:
      - x_min y_min x_max y_max
      - x_center y_center width height (YOLO format), values can be normalized [0,1] or absolute pixels

    image_shape: (height, width)
    Returns list of [x_min, y_min, x_max, y_max] in absolute pixel coordinates.
    """
    h, w = image_shape
    boxes: List[List[float]] = []
    if not os.path.isfile(annotation_txt_path):
        return boxes
    with open(annotation_txt_path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split()
            # Skip optional class id if provided as first token
            if len(parts) == 5:
                # Assume class_id cx cy bw bh normalized or absolute
                try:
                    _ = float(parts[0])
                    coords = list(map(float, parts[1:]))
                except ValueError:
                    continue
                cx, cy, bw, bh = coords
                normalized = 0.0 <= cx <= 1.0 and 0.0 <= cy <= 1.0 and 0.0 < bw <= 1.0 and 0.0 < bh <= 1.0
                if normalized:
                    cx, cy, bw, bh = cx * w, cy * h, bw * w, bh * h
                x_min = max(0.0, cx - bw / 2.0)
                y_min = max(0.0, cy - bh / 2.0)
                x_max = min(float(w), cx + bw / 2.0)
                y_max = min(float(h), cy + bh / 2.0)
                boxes.append([x_min, y_min, x_max, y_max])
            elif len(parts) == 4:
                # Either xyxy or normalized cx cy w h without class
                vals = list(map(float, parts))
                x1, y1, x2, y2 = vals
                # Heuristic: if any value <= 1.2 assume normalized xywh (cx,cy,w,h)
                if 0.0 <= x1 <= 1.0 and 0.0 <= y1 <= 1.0 and 0.0 < x2 <= 1.0 and 0.0 < y2 <= 1.0:
                    cx, cy, bw, bh = x1 * w, y1 * h, x2 * w, y2 * h
                    x_min = max(0.0, cx - bw / 2.0)
                    y_min = max(0.0, cy - bh / 2.0)
                    x_max = min(float(w), cx + bw / 2.0)
                    y_max = min(float(h), cy + bh / 2.0)
                else:
                    x_min, y_min = max(0.0, x1), max(0.0, y1)
                    x_max, y_max = min(float(w), x2), min(float(h), y2)
                boxes.append([x_min, y_min, x_max, y_max])
            else:
                # Unsupported line format
                continue
    return boxes


def load_image_and_boxes(image_path: str, annotation_txt_path: str) -> Tuple[torch.Tensor, List[List[float]]]:
    """
    Loads image (BGR) and corresponding boxes from txt. Returns RGB tensor [C,H,W] and boxes in xyxy.
    """
    img_bgr = cv2.imread(image_path)
    if img_bgr is None:
        raise FileNotFoundError(f"Image not found: {image_path}")
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    h, w = img_rgb.shape[:2]
    boxes = read_face_boxes_from_txt(annotation_txt_path, (h, w))
    tensor = torch.from_numpy(img_rgb).permute(2, 0, 1).float() / 255.0
    return tensor, boxes


def build_index_from_dirs(images_dir: str, annotations_dir: str) -> List[Dict[str, str]]:
    """
    Build a simple index mapping image file to its annotation .txt if exists.
    Returns list of dicts: {"image": image_path, "annotation": annotation_path}
    """
    supported = {'.jpg', '.jpeg', '.png', '.bmp'}
    entries: List[Dict[str, str]] = []
    for root, _, files in os.walk(images_dir):
        for f in files:
            ext = os.path.splitext(f)[1].lower()
            if ext not in supported:
                continue
            img_path = os.path.join(root, f)
            base = os.path.splitext(f)[0]
            ann_path = os.path.join(annotations_dir, base + '.txt')
            entries.append({
                'image': img_path,
                'annotation': ann_path if os.path.isfile(ann_path) else ''
            })
    return entries



