from typing import List, Tuple

import cv2
import torch
import torchvision

from utils.general import box_iou


def load_face_model(weights_path: str, device: torch.device):
    model = torchvision.models.detection.fasterrcnn_resnet50_fpn(weights=None, pretrained=False)
    in_features = model.roi_heads.box_predictor.cls_score.in_features
    model.roi_heads.box_predictor = torchvision.models.detection.faster_rcnn.FastRCNNPredictor(in_features, 2)
    ckpt = torch.load(weights_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt['model'])
    model.to(device).eval()
    return model


def run_face_detector(model, img_bgr, device, conf_thresh=0.5):
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    tensor = torch.from_numpy(img_rgb).permute(2, 0, 1).float() / 255.0
    with torch.no_grad():
        out = model([tensor.to(device)])
    boxes = out[0]['boxes']
    scores = out[0]['scores']
    labels = out[0]['labels']
    keep = (scores >= conf_thresh) & (labels == 1)
    boxes = boxes[keep]
    scores = scores[keep]
    if boxes.numel() == 0:
        return []
    keep_idx = torchvision.ops.nms(boxes, scores, 0.4)
    boxes = boxes[keep_idx].cpu()
    scores = scores[keep_idx].cpu()
    faces = []
    for b, s in zip(boxes, scores):
        x1, y1, x2, y2 = b.tolist()
        faces.append((x1, y1, x2, y2, float(s)))
    return faces


def deduplicate_counts(yolo_boxes_xyxy: torch.Tensor, face_boxes_xyxy: List[Tuple[float, float, float, float, float]], iou_thresh=0.2):
    """
    Returns: (unique_person_boxes, unique_face_boxes, total_count)
    A face is considered duplicate if it has IoU > iou_thresh with any person box.
    """
    person_count = int(yolo_boxes_xyxy.shape[0]) if yolo_boxes_xyxy is not None else 0
    unique_faces = []
    if yolo_boxes_xyxy is None or person_count == 0:
        return yolo_boxes_xyxy, face_boxes_xyxy, len(face_boxes_xyxy)
    person_boxes = yolo_boxes_xyxy[:, :4].float().cpu()
    for (x1, y1, x2, y2, s) in face_boxes_xyxy:
        fb = torch.tensor([[x1, y1, x2, y2]], dtype=torch.float32)
        ious = box_iou(fb, person_boxes)  # 1 x N
        if (ious.max() if ious.numel() else torch.tensor(0.0)) <= iou_thresh:
            unique_faces.append((x1, y1, x2, y2, s))
    total = person_count + len(unique_faces)
    return yolo_boxes_xyxy, unique_faces, total


