import argparse
from typing import List

import cv2
import torch
import torchvision


def load_model(weights_path: str, device: torch.device):
    model = torchvision.models.detection.fasterrcnn_resnet50_fpn(weights=None, pretrained=False)
    in_features = model.roi_heads.box_predictor.cls_score.in_features
    model.roi_heads.box_predictor = torchvision.models.detection.faster_rcnn.FastRCNNPredictor(in_features, 2)
    ckpt = torch.load(weights_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt['model'])
    model.to(device).eval()
    return model


def detect_faces_on_image(model, img_bgr, device, conf_thresh=0.5):
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    tensor = torch.from_numpy(img_rgb).permute(2, 0, 1).float() / 255.0
    with torch.no_grad():
        out = model([tensor.to(device)])
    boxes = out[0]['boxes'].cpu()
    scores = out[0]['scores'].cpu()
    labels = out[0]['labels'].cpu()
    result = []
    for b, s, l in zip(boxes, scores, labels):
        if s.item() < conf_thresh or l.item() != 1:
            continue
        x1, y1, x2, y2 = b.tolist()
        result.append((x1, y1, x2, y2, s.item()))
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--weights', required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--device', default='')
    parser.add_argument('--conf-thres', type=float, default=0.5)
    opt = parser.parse_args()

    device = torch.device(opt.device if opt.device else ('cuda' if torch.cuda.is_available() else 'cpu'))
    model = load_model(opt.weights, device)

    img = cv2.imread(opt.source)
    faces = detect_faces_on_image(model, img, device, opt.conf_thres)
    for (x1, y1, x2, y2, s) in faces:
        cv2.rectangle(img, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 255), 2)
        cv2.putText(img, f'face {s:.2f}', (int(x1), int(y1) - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
    cv2.imshow('faces', img)
    cv2.waitKey(0)


if __name__ == '__main__':
    main()


