import argparse
import json
import os


def build_index(images_dir: str, annotations_dir: str):
    supported = {'.jpg', '.jpeg', '.png', '.bmp'}
    entries = []
    for root, _, files in os.walk(images_dir):
        for f in files:
            ext = os.path.splitext(f)[1].lower()
            if ext not in supported:
                continue
            img_path = os.path.join(root, f)
            base = os.path.splitext(f)[0]
            ann_path = os.path.join(annotations_dir, base + '.txt')
            entries.append({'image': img_path, 'annotation': ann_path if os.path.isfile(ann_path) else ''})
    return entries


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--images', required=True)
    parser.add_argument('--ann', required=True)
    parser.add_argument('--out', default='face_index.json')
    opt = parser.parse_args()
    index = build_index(opt.images, opt.ann)
    with open(opt.out, 'w') as f:
        json.dump(index, f, indent=2)
    print(f'Saved index with {len(index)} entries to {opt.out}')


if __name__ == '__main__':
    main()



