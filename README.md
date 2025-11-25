
# YOLO-CROWD
YOLO-CROWD is a lightweight crowd counting and face detection model that is based on Yolov5s and can run on edge devices, as well as fixing the problems of face occlusion, varying face scales, and other challenges of crowd counting


## Description
Deep learning-based algorithms for face and crowd identification have advanced significantly. These algorithms can be broadly categorized into two groups: one-stage detectors like YOLO and two-stage detectors like Faster R-CNN. One-stage detectors have been widely employed in many applications due to the better balance between accuracy and speed, but as we are all aware, YOLO algorithms are significantly impacted by occlusion in crowd scenarios. In our project, we propose a real-time crowd counter and face detector called **YOLO-CROWD**, which has an inference speed of **10.1 ms** and contains 461 layers and 18388982 parameters. It is based on the one-stage detector YOLOv5. In order to improve the receptive field of small faces, we use a Receptive Field Enhancement module termed RFE. We then use NWD Loss to compensate for the sensitivity of IoU to the position deviation of small objects. We also employ Repulsion Loss to address face occlusion and utilize an attention module called
SEAM.

## Demo
### Images
![test-yolo-crowd](https://github.com/zaki1003/YOLO-CROWD/assets/65148928/6aed4956-1da5-4b98-ae8a-e7d9574b4054)

![Screenshot from 2023-04-07 15-49-11](https://github.com/zaki1003/YOLO-CROWD/assets/65148928/e435d92b-42f2-4152-bcad-b72268db8d0e)

![Screenshot from 2023-04-07 15-48-52](https://github.com/zaki1003/YOLO-CROWD/assets/65148928/2b5e3273-a697-472c-a201-0b23e5b2faa6)


### Videos
#### without showing label

https://github.com/zaki1003/YOLO-CROWD/assets/65148928/b0a57b00-ae72-4a5c-ad68-442be1889e0a







#### with showing label (name + conf)
https://github.com/zaki1003/YOLO-CROWD/assets/65148928/44753430-c5ef-4c15-80c7-e0f328670aac

## Comparison Between Yolov5s And YOLO-CROWD

|                |          mAp@0.5      |       mAp@0.5-0.95   |           Precision      |          Recall         |         Box loss        |         Object loss      |     Inference Time (ms)  |
|:-------------------|:---------------|:--------------|:-------------|:-----------|:------------------|:------------------|:-----------------------------|
|         Yolov5s      |          39.4      |     0.15       |        0.754        |        0.382           |      0.120            |    0.266                  |        **7**            |                    
|       YOLO-CROWD        |            **43.6**          |         **0.158**         |      **0.756**        |        **0.424**        |         **0.091**       |  **0.158**       |       10.1        | 




## Environment Requirments
Create a Python Virtual Environment.   
```shell
conda create -n {name} python=x.x
```

Enter Python Virtual Environment.   
```shell
conda activate {name}
```


```shell 
!pip install install torch==1.11 torchvision==0.12 torchtext==0.12 torchaudio==0.11
```

Install other python package.   
```shell
pip install -r requirements.txt
```

## Step-Through Example
### Installation
Get the code.    
```shell
git clone https://github.com/zaki1003/YOLO-CROWD.git
```

### Dataset

Download our Dataset [crowd-counting-dataset-w3o7w](https://universe.roboflow.com/crowd-dataset/crowd-counting-dataset-w3o7w), while exporting the dataset select **YOLO v5 PyTorch** Format.

![our-dataset](https://github.com/zaki1003/YOLO-CROWD/assets/65148928/7c574121-7eb5-450c-a61d-d259643d22fb)



## Preweight
The link is [yolov5s.pt](https://github.com/ultralytics/yolov5/releases/download/v5.0/yolov5s.pt)


### Training
Train your model on **crowd-counting-dataset-w3o7w** dataset.
```shell
python train.py --img 416
                --batch 16
                --epochs 200
                --data {dataset.location}/data.yaml
                --cfg models/yolo-crowd.yaml    
                --weights yolov5s.pt      
                --name yolo_crowd_results
                --cache
```

## Postweight
The link is [yolo-crowd.pt](https://drive.google.com/file/d/1xxXVCzseuzmHv7NoMQ03RVU_tDisWXjM/view?usp=sharing)
If you want to have more inference speed try to install TensorRt and use this vesion [yolo-crowd.engine](https://drive.google.com/file/d/1-189sscpNZBFaSHOz7dnEgAaFeUALiow/view?usp=sharing)


### Test
```shell
python detect.py --weights yolo-crowd.pt --source 0                               # webcam
                                                  img.jpg                         # image
                                                  vid.mp4                         # video
                                                  screen                          # screenshot
                                                  path/                           # directory
                                                  list.txt                        # list of images
                                                  list.streams                    # list of streams
                                                  'path/*.jpg'                    # glob
                                                  'https://youtu.be/Zgi9g1ksQHc'  # YouTube
                                                  'rtsp://example.com/media.mp4'  # RTSP, RTMP, HTTP stream
```

### Dense Crowd Enhancement with ResNet Face Detector

This repo now supports a modular secondary ResNet-based face detector (Faster R-CNN ResNet-50-FPN) to improve person counting in dense, small/occluded scenarios. The workflow:

- YOLO-CROWD detects person bodies (primary detector).
- When very small people/faces are missed, a face detector runs and detections are merged with YOLO results using IoU-based de-duplication to avoid double counting.

#### Face Annotation Format (.txt only)

Each image should have a corresponding `.txt` file listing face boxes per line in either format:

- `x_min y_min x_max y_max` (absolute pixels), or
- `class_id cx cy w h` or `cx cy w h` (YOLO format). Values can be normalized [0,1] or in pixels.

Utilities are provided to index and parse these annotations.

#### Utilities

- Build a simple index of images to `.txt` annotations:
```shell
python face/convert_txt_to_index.py --images path/to/images --ann path/to/face_txt --out face_index.json
```

#### Train the ResNet Face Detector

Uses only images and `.txt` files (no COCO-style annotation files needed).
```shell
python face/train_face_resnet.py --images path/to/images \
                                 --ann path/to/face_txt \
                                 --epochs 20 \
                                 --batch 4 \
                                 --device 0 \
                                 --output runs/face
```
This creates `runs/face/face_resnet50fpn_best.pt`.

#### Inference: Dual Detector with De-duplication and Visualization

Run YOLO-CROWD normally, and provide the face weights to enable face-based counting augmentation. Face detections are shown in yellow with label `face`.
```shell
python detect.py --weights yolo-crowd.pt \
                 --source path/to/video_or_images \
                 --face-weights runs/face/face_resnet50fpn_best.pt \
                 --face-conf-thres 0.5 \
                 --face-iou-dedup 0.2 \
                 --view-img
```

Output overlay shows `Number of people=` using the combined count (YOLO persons + unique faces not overlapping person boxes above IoU threshold).

#### Edge-Device Notes

- The face detector is optional and off by default. Omit `--face-weights` to keep the original lightweight pipeline.
- For constrained devices, reduce input sizes or run face detector only on frames with few/no YOLO detections.
- Torch/Torchvision versions are compatible with the project requirements; no extra packages needed beyond `requirements.txt`.

#### Code Structure (Face Module)

- `face/utils_face_annotations.py`: parse `.txt` face boxes.
- `face/dataset_face.py`: dataset to feed the face detector.
- `face/train_face_resnet.py`: training script (ResNet-50 FPN).
- `face/integration.py`: loads face model, runs inference, and de-duplicates with YOLO.
- `face/inference_face_resnet.py`: standalone face inference for debugging.

#### Notes on Counting Logic

- We deduplicate by marking a face as duplicate if IoU with any YOLO person box exceeds `--face-iou-dedup` (default 0.2). Adjust as needed for your scenes.
- In dense frames, faces missed by YOLO still contribute to the final count.



## Results

![results-yolo-crowd](https://github.com/zaki1003/YOLO-CROWD/assets/65148928/9e2d18ce-aaf6-4a20-91f0-d8d1eb88728c)


## Finetune
see in *[https://github.com/ultralytics/yolov5/issues/607](https://github.com/ultralytics/yolov5/issues/607)*
```shell
# Single-GPU
python train.py --epochs 10 --data coco128.yaml --weights yolov5s.pt --cache --evolve

# Multi-GPU
for i in 0 1 2 3 4 5 6 7; do
  sleep $(expr 30 \* $i) &&  # 30-second delay (optional)
  echo 'Starting GPU '$i'...' &&
  nohup python train.py --epochs 10 --data coco128.yaml --weights yolov5s.pt --cache --device $i --evolve > evolve_gpu_$i.log &
done

# Multi-GPU bash-while (not recommended)
for i in 0 1 2 3 4 5 6 7; do
  sleep $(expr 30 \* $i) &&  # 30-second delay (optional)
  echo 'Starting GPU '$i'...' &&
  "$(while true; do nohup python train.py... --device $i --evolve 1 > evolve_gpu_$i.log; done)" &
done
```

## Reference
*[https://github.com/ultralytics/yolov5](https://github.com/ultralytics/yolov5)*    
    
*[https://github.com/deepcam-cn/yolov5-face](https://github.com/Krasjet-Yu/YOLO-FaceV2)*  
    
*[https://github.com/open-mmlab/mmdetection](https://github.com/open-mmlab/mmdetection)*   
    
*[https://github.com/dongdonghy/repulsion_loss_pytorch](https://github.com/dongdonghy/repulsion_loss_pytorch)*   



## Contact

We use code's license is MIT License. The code can be used for business inquiries or professional support requests.
