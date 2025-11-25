import os
from typing import Tuple, Dict

import cv2
import torch
from torch.utils.data import Dataset

from .utils_face_annotations import read_face_boxes_from_txt


class FaceDetectionTxtDataset(Dataset):
    """
    Dataset for face detection from images and .txt annotation files containing face boxes.
    Returns images as tensors [C,H,W] in [0,1] and targets in torchvision detection format.
    """

    def __init__(self, images_dir: str, annotations_dir: str, transforms=None):
        self.images_dir = images_dir
        self.annotations_dir = annotations_dir
        self.transforms = transforms
        self.image_paths = []
        supported = {'.jpg', '.jpeg', '.png', '.bmp'}
        for root, _, files in os.walk(images_dir):
            for f in files:
                if os.path.splitext(f)[1].lower() in supported:
                    self.image_paths.append(os.path.join(root, f))
        self.image_paths.sort()

    def __len__(self):
        return len(self.image_paths)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, Dict[str, torch.Tensor]]:
        img_path = self.image_paths[idx]
        img_bgr = cv2.imread(img_path)
        if img_bgr is None:
            raise FileNotFoundError(f"Image not found: {img_path}")
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        h, w = img_rgb.shape[:2]
        base = os.path.splitext(os.path.basename(img_path))[0]
        ann_path = os.path.join(self.annotations_dir, base + '.txt')
        boxes_xyxy = read_face_boxes_from_txt(ann_path, (h, w))

        boxes_tensor = torch.zeros((len(boxes_xyxy), 4), dtype=torch.float32)
        for i, b in enumerate(boxes_xyxy):
            boxes_tensor[i] = torch.tensor(b, dtype=torch.float32)

        labels = torch.ones((len(boxes_xyxy),), dtype=torch.int64)  # class 1: face
        image_id = torch.tensor([idx])
        area = (boxes_tensor[:, 2] - boxes_tensor[:, 0]).clamp(min=0) * \
               (boxes_tensor[:, 3] - boxes_tensor[:, 1]).clamp(min=0)
        iscrowd = torch.zeros((len(boxes_xyxy),), dtype=torch.int64)

        img_tensor = torch.from_numpy(img_rgb).permute(2, 0, 1).float() / 255.0

        target = {
            'boxes': boxes_tensor,
            'labels': labels,
            'image_id': image_id,
            'area': area,
            'iscrowd': iscrowd,
        }

        if self.transforms is not None:
            sample = self.transforms(image=img_rgb, bboxes=boxes_xyxy, labels=labels.tolist())
            img_tensor = torch.from_numpy(sample['image']).permute(2, 0, 1).float() / 255.0
            if sample['bboxes']:
                target['boxes'] = torch.tensor(sample['bboxes'], dtype=torch.float32)

        return img_tensor, target



