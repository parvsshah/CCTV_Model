import argparse
import os
from typing import List

import cv2
import torch
import torchvision


def load_model(weights_path: str, device: torch.device):
    model = torchvision.models.detection.fasterrcnn_resnet50_fpn(weights=None, pretrained=False)
    in_features = model.roi_heads.box_predictor.cls_score.in_features
    model.roi_heads.box_predictor = torchvision.models.detection.faster_rcnn.FastRCNNPredictor(in_features, 2)
    ckpt = torch.load(weights_path, map_location=device)
    model.load_state_dict(ckpt['model'])
    return model.to(device).eval()


def read_existing_boxes(txt_path: str) -> List[List[float]]:
    boxes = []
    if not os.path.isfile(txt_path):
        return boxes
    with open(txt_path, 'r') as f:
        for line in f:
            parts = line.strip().split()
            if not parts:
                continue
            # YOLO 1.1 format: class cx cy w h (normalized)
            if len(parts) == 5:
                try:
                    _ = int(float(parts[0]))
                    boxes.append([float(v) for v in parts[1:]])
                except Exception:
                    continue
    return boxes


def write_boxes(txt_path: str, normalized_boxes: List[List[float]]):
    with open(txt_path, 'a') as f:
        for cx, cy, w, h in normalized_boxes:
            f.write(f"1 {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}\n")


def xyxy_to_yolo_norm(x1, y1, x2, y2, img_w, img_h):
    cx = (x1 + x2) / 2.0 / img_w
    cy = (y1 + y2) / 2.0 / img_h
    w = (x2 - x1) / img_w
    h = (y2 - y1) / img_h
    return [max(0.0, min(1.0, cx)), max(0.0, min(1.0, cy)), max(0.0, min(1.0, w)), max(0.0, min(1.0, h))]


def main():
    parser = argparse.ArgumentParser(description='Auto-complete sparse face labels using a trained ResNet face detector')
    parser.add_argument('--images', required=True, help='Images root')
    parser.add_argument('--ann', required=True, help='Annotations root (YOLO 1.1 txt)')
    parser.add_argument('--weights', required=True, help='Face detector weights (.pt)')
    parser.add_argument('--device', default='')
    parser.add_argument('--conf-thres', type=float, default=0.6)
    parser.add_argument('--iou-nms', type=float, default=0.4)
    parser.add_argument('--min-size', type=int, default=6, help='skip very tiny boxes (px)')
    opt = parser.parse_args()

    device = torch.device(opt.device if opt.device else ('cuda' if torch.cuda.is_available() else 'cpu'))
    model = load_model(opt.weights, device)

    supported = {'.jpg', '.jpeg', '.png', '.bmp'}
    for root, _, files in os.walk(opt.images):
        for f in files:
            if os.path.splitext(f)[1].lower() not in supported:
                continue
            img_path = os.path.join(root, f)
            base = os.path.splitext(f)[0]
            txt_path = os.path.join(opt.ann, base + '.txt')

            img = cv2.imread(img_path)
            if img is None:
                continue
            h, w = img.shape[:2]
            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            tensor = torch.from_numpy(rgb).permute(2, 0, 1).float() / 255.0
            with torch.no_grad():
                out = model([tensor.to(device)])
            boxes = out[0]['boxes'].cpu()
            scores = out[0]['scores'].cpu()
            labels = out[0]['labels'].cpu()

            keep = (scores >= opt.conf_thres) & (labels == 1)
            boxes = boxes[keep]
            scores = scores[keep]
            if boxes.numel() == 0:
                continue
            keep_idx = torchvision.ops.nms(boxes, scores, opt.iou_nms)
            boxes = boxes[keep_idx]

            proposed = []
            for b in boxes:
                x1, y1, x2, y2 = [float(v) for v in b.tolist()]
                if (x2 - x1) < opt.min_size or (y2 - y1) < opt.min_size:
                    continue
                proposed.append(xyxy_to_yolo_norm(x1, y1, x2, y2, w, h))

            if not proposed:
                continue

            os.makedirs(opt.ann, exist_ok=True)
            write_boxes(txt_path, proposed)
            print(f"Augmented: {txt_path} (+{len(proposed)})")


if __name__ == '__main__':
    main()




