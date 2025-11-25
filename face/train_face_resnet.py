import argparse
import os
import sys
from typing import Tuple

import torch
import torchvision
from torch.utils.data import DataLoader, random_split

# Robust imports for both module and script execution
try:
    from .dataset_face import FaceDetectionTxtDataset  # type: ignore
except Exception:
    FILE_DIR = os.path.dirname(os.path.abspath(__file__))
    REPO_ROOT = os.path.dirname(FILE_DIR)
    if REPO_ROOT not in sys.path:
        sys.path.insert(0, REPO_ROOT)
    from face.dataset_face import FaceDetectionTxtDataset  # type: ignore


def create_model(num_classes: int = 2):
    # Faster R-CNN with ResNet-50 FPN
    model = torchvision.models.detection.fasterrcnn_resnet50_fpn(weights=None, pretrained=False)
    in_features = model.roi_heads.box_predictor.cls_score.in_features
    model.roi_heads.box_predictor = torchvision.models.detection.faster_rcnn.FastRCNNPredictor(in_features, num_classes)
    return model


def collate_fn(batch):
    return tuple(zip(*batch))


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--images', type=str, required=True, help='Path to images root')
    parser.add_argument('--ann', type=str, required=True, help='Path to annotations (.txt) root')
    parser.add_argument('--epochs', type=int, default=20)
    parser.add_argument('--batch', type=int, default=4)
    parser.add_argument('--lr', type=float, default=0.005)
    parser.add_argument('--momentum', type=float, default=0.9)
    parser.add_argument('--weight-decay', type=float, default=0.0005)
    parser.add_argument('--device', type=str, default='', help="'cpu', 'cuda', 'cuda:0', or GPU index like '0'")
    parser.add_argument('--val-split', type=float, default=0.1)
    parser.add_argument('--output', type=str, default='runs/face')
    return parser.parse_args()


def main():
    opt = parse_args()
    dev_arg = (opt.device or '').strip()
    if dev_arg == '' or dev_arg.lower() == 'auto':
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    elif dev_arg.lower() in ('cpu', 'cuda'):
        device = torch.device(dev_arg.lower())
    elif dev_arg.isdigit():
        device = torch.device(f'cuda:{dev_arg}')
    else:
        device = torch.device(dev_arg)

    # Safe fallback if CUDA requested but not available
    if device.type == 'cuda' and not torch.cuda.is_available():
        print('WARNING: CUDA requested but not available. Falling back to CPU.')
        device = torch.device('cpu')

    dataset = FaceDetectionTxtDataset(opt.images, opt.ann)
    val_len = int(len(dataset) * opt.val_split)
    train_len = len(dataset) - val_len
    if val_len > 0:
        dataset_train, dataset_val = random_split(dataset, [train_len, val_len])
    else:
        dataset_train, dataset_val = dataset, None

    loader_train = DataLoader(dataset_train, batch_size=opt.batch, shuffle=True, num_workers=2, collate_fn=collate_fn)
    loader_val = DataLoader(dataset_val, batch_size=opt.batch, shuffle=False, num_workers=2, collate_fn=collate_fn) if dataset_val else None

    model = create_model(num_classes=2)
    model.to(device)

    params = [p for p in model.parameters() if p.requires_grad]
    optimizer = torch.optim.SGD(params, lr=opt.lr, momentum=opt.momentum, weight_decay=opt.weight_decay)

    os.makedirs(opt.output, exist_ok=True)
    best_loss = float('inf')

    for epoch in range(opt.epochs):
        model.train()
        total_loss = 0.0
        for images, targets in loader_train:
            images = [img.to(device) for img in images]
            targets = [{k: v.to(device) for k, v in t.items()} for t in targets]
            loss_dict = model(images, targets)
            losses = sum(loss for loss in loss_dict.values())

            optimizer.zero_grad()
            losses.backward()
            optimizer.step()

            total_loss += losses.item()

        avg_loss = total_loss / max(1, len(loader_train))
        print(f'Epoch {epoch+1}/{opt.epochs} train loss: {avg_loss:.4f}')

        if loader_val is not None:
            model.eval()
            val_loss = 0.0
            with torch.no_grad():
                for images, targets in loader_val:
                    images = [img.to(device) for img in images]
                    targets = [{k: v.to(device) for k, v in t.items()} for t in targets]
                    loss_dict = model(images, targets)
                    losses = sum(loss for loss in loss_dict.values())
                    val_loss += losses.item()
            val_loss /= max(1, len(loader_val))
            print(f'           val loss: {val_loss:.4f}')
        else:
            val_loss = avg_loss

        if val_loss < best_loss:
            best_loss = val_loss
            ckpt = os.path.join(opt.output, 'face_resnet50fpn_best.pt')
            torch.save({'model': model.state_dict()}, ckpt)
            print(f'Saved: {ckpt}')


if __name__ == '__main__':
    main()


