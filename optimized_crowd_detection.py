# -*- coding: utf-8 -*-
import argparse
import time
import sys
import json
from pathlib import Path

import cv2
import torch
import torch.backends.cudnn as cudnn
from numpy import random
import csv
import os

from models.experimental import attempt_load
from utils.datasets import LoadStreams, LoadImages
from utils.general import check_img_size, check_requirements, check_imshow, non_max_suppression, apply_classifier, \
    scale_coords, xyxy2xywh, strip_optimizer, set_logging, increment_path
from utils.plots import plot_one_box
from utils.torch_utils import select_device, load_classifier, time_synchronized

class DynamicCrowdColorMapper:
    """Class to handle dynamic color coding based on running maximum crowd density"""
    
    def __init__(self, base_max=120):
        self.base_max = base_max  # Initial maximum value
        self.current_max = base_max  # Running maximum
        self.previous_count = 0  # Previous frame count (for 1-frame lag)
        self.is_first_frame = True  # Track if this is the first frame
        
        # Define color scheme (BGR format for OpenCV)
        self.colors = {
            'green': (0, 255, 0),      # 0-30%
            'yellow': (0, 255, 255),   # 30-60%
            'red': (0, 0, 255)         # 60-100%
        }
        
        # Density level names for display
        self.density_names = {
            'green': 'LOW',
            'yellow': 'MODERATE',
            'red': 'HIGH'
        }
    
    def update_maximum(self, current_count):
        """Update running maximum if current count exceeds it"""
        if current_count > self.current_max:
            self.current_max = current_count
            print(f"[INFO] New maximum crowd count detected: {self.current_max}")
    
    def get_crowd_level(self, people_count):
        """Determine crowd density level based on people count and current maximum"""
        # Calculate percentage thresholds based on current maximum
        threshold_30 = self.current_max * 0.30
        threshold_60 = self.current_max * 0.60
        
        if people_count < threshold_30:
            return 'green'
        elif people_count < threshold_60:
            return 'yellow'
        else:
            return 'red'
    
    def get_color_for_frame(self, current_count):
        """
        Get color for current frame based on previous frame count (1-frame lag)
        Also updates the maximum value
        """
        # For first frame, return default green color
        if self.is_first_frame:
            self.is_first_frame = False
            # Update maximum with first frame count
            self.update_maximum(current_count)
            self.previous_count = current_count
            return self.colors['green'], 'green', 'LOW'
        
        # IMPORTANT: Update running maximum FIRST with current count
        self.update_maximum(current_count)
        
        # THEN use previous frame's count against CURRENT maximum thresholds
        level = self.get_crowd_level(self.previous_count)
        color = self.colors[level]
        density_name = self.density_names[level]
        
        # Update previous count for next frame
        self.previous_count = current_count
        
        return color, level, density_name
    
    def get_thresholds(self):
        """Get current threshold values for display"""
        return {
            'green_max': int(self.current_max * 0.30),
            'yellow_max': int(self.current_max * 0.60),
            'red_max': self.current_max
        }

def detect(save_img=False):
    # Ensure paths are absolute
    source = str(opt.source)  # Get source from command line arguments
    webcam = source.isnumeric() or source.endswith('.txt') or source.lower().startswith(
        ('rtsp://', 'rtmp://', 'http://', 'https://'))

    # Initialize display/save flags from CLI options so they are always defined
    view_img = bool(getattr(opt, "view_img", False))
    # save_img parameter can force saving; otherwise default to not nosave
    save_img = bool(save_img or not getattr(opt, "nosave", False))

    # If source is a local file without extension, try to determine video type and rename
    if not webcam and os.path.isfile(source) and not Path(source).suffix:
        try:
            with open(source, 'rb') as f:
                header = f.read(12)  # Read first 12 bytes to check signature

            new_source = None
            # MP4/M4V/ISO base media
            if header.startswith(b'\x00\x00\x00 ftyp') or header.startswith(b'\x00\x00\x00\x18ftyp'):
                new_source = f"{source}.mp4"
            # AVI (RIFF....AVI )
            elif header.startswith(b'RIFF') and len(header) > 8 and header[8:12] == b'AVI ':
                new_source = f"{source}.avi"
            # MKV/WEBM (Matroska)
            elif header.startswith(b'\x1A\x45\xDF\xA3'):
                new_source = f"{source}.mkv"
            # FLV
            elif header.startswith(b'FLV\x01'):
                new_source = f"{source}.flv"
            else:
                # Fallback: try to open with OpenCV to see if it's a valid video
                cap = cv2.VideoCapture(source)
                if cap.isOpened():
                    new_source = f"{source}.mp4"
                    cap.release()

            if new_source:
                try:
                    os.rename(source, new_source)
                    source = new_source
                    opt.source = source
                    print(f"[INFO] Renamed file to include extension: {source}")
                except Exception as e:
                    print(f"[WARNING] Could not rename file: {e}")
        except Exception as e:
            print(f"[WARNING] Could not determine file type for {source}: {e}")
    
    # Use provided output directory or default to runs/detect/expN
    if opt.output:
        output_dir = Path(opt.output)
        output_dir.mkdir(parents=True, exist_ok=True)
    else:
        save_dir = increment_path(Path(opt.project) / opt.name, exist_ok=opt.exist_ok)
        output_dir = save_dir
        save_dir.mkdir(parents=True, exist_ok=True)

    # Initialize dynamic color mapper with base maximum
    color_mapper = DynamicCrowdColorMapper(base_max=opt.base_max)
    
    print(f"\n=== DYNAMIC COLOR-CODED CROWD DETECTION ===")
    print(f"Base maximum count: {opt.base_max}")
    print(f"Color coding (based on percentage of current maximum):")
    print(f"  GREEN (LOW): 0-30% of max")
    print(f"  YELLOW (MODERATE): 30-60% of max")
    print(f"  RED (HIGH): 60-100% of max")
    print(f"Using 1-frame lag for color determination\n")

    # Create organized directory structure
    processed_dir = output_dir / 'processed'
    alert_dir = output_dir / 'alerts'
    tracking_dir = output_dir / 'tracking'
    stream_dir = output_dir / 'stream'  # For real-time frame streaming
    
    # Create directories if they don't exist
    for dir_path in [processed_dir, alert_dir, tracking_dir, stream_dir]:
        dir_path.mkdir(parents=True, exist_ok=True)
    
    # Generate timestamp for file naming
    timestamp = time.strftime('%Y%m%d_%H%M%S')
    
    # Get source name for file naming
    if webcam:
        if source.startswith(('http://', 'https://', 'rtsp://', 'rtmp://')):
            # Extract domain name from URL for stream sources
            from urllib.parse import urlparse
            source_name = urlparse(source).netloc.replace('.', '_')
        else:
            source_name = f"camera_{source}"
    else:
        source_name = Path(source).stem
    
    # Create final filenames with timestamp
    base_filename = f"{source_name}_{timestamp}"
    video_path = processed_dir / f"{base_filename}.mp4"
    alert_path = alert_dir / f"{base_filename}.jpg"
    csv_path = tracking_dir / f"{base_filename}.csv"
    
    # Initialize logging and device selection
    set_logging()
    print("\n=== YOLO CROWD DETECTION INITIALIZATION ===")
    print(f"[INFO] Python version: {sys.version}")
    print(f"[INFO] PyTorch version: {torch.__version__}")
    print(f"[INFO] CUDA available: {torch.cuda.is_available()}")
    
    # Select device with fallback to CPU
    print("\n=== DEVICE SELECTION ===")
    device = None
    half = False
    
    # If CUDA is explicitly requested but not available, warn and fall back to CPU
    if opt.device and opt.device.lower() != 'cpu' and not torch.cuda.is_available():
        print(f"[WARNING] CUDA device {opt.device} requested but CUDA is not available. Falling back to CPU.")
        opt.device = 'cpu'
    
    try:
        device = select_device(opt.device)
        half = device.type != 'cpu'
        print(f"[INFO] Using device: {device}")
        
        if device.type == 'cuda':
            print(f"[INFO] CUDA device: {torch.cuda.get_device_name(0)}")
            print(f"[INFO] CUDA version: {torch.version.cuda}")
            print(f"[INFO] CUDA memory allocated: {torch.cuda.memory_allocated()/1e9:.2f}GB")
            print(f"[INFO] CUDA memory cached: {torch.cuda.memory_reserved()/1e9:.2f}GB")
        else:
            print("[INFO] Using CPU for inference (slower than GPU)")
            print("[INFO] For faster processing, install PyTorch with CUDA support")
            
    except Exception as e:
        print(f"[WARNING] Error initializing device {opt.device}: {str(e)}")
        print("[INFO] Falling back to CPU")
        device = select_device('cpu')
        half = False
    
    # Get weights path from opt.weights (handling both string and list cases)
    weights_path = opt.weights[0] if isinstance(opt.weights, (list, tuple)) else opt.weights
    
    # Get image size from command line arguments
    imgsz = opt.img_size
    
    # Verify model file with better error handling
    print("\n=== MODEL LOADING ===")
    print(f"[INFO] Loading model from: {weights_path}")
    print(f"[INFO] Image size: {imgsz}px")
    
    # Check if weights file exists
    if not os.path.isfile(weights_path):
        error_msg = f"[ERROR] Model file not found: {weights_path}"
        print(error_msg)
        # Try to find the model in the same directory as the script
        script_dir = os.path.dirname(os.path.abspath(__file__))
        possible_path = os.path.join(script_dir, os.path.basename(weights_path))
        if os.path.isfile(possible_path):
            weights_path = possible_path
            opt.weights = [weights_path] if isinstance(opt.weights, (list, tuple)) else weights_path
            print(f"[INFO] Found model at alternative path: {weights_path}")
        else:
            raise FileNotFoundError(f"Model file not found at {weights_path} or {possible_path}")
    
    try:
        # Verify model file integrity
        file_size = os.path.getsize(weights_path) / (1024 * 1024)  # in MB
        print(f"[INFO] Model file size: {file_size:.2f} MB")
        
        # Check file header
        with open(weights_path, 'rb') as f:
            header = f.read(100)
            if not header.startswith(b'PK\x03\x04'):
                print("[WARNING] File header doesn't match expected format, but will attempt to load anyway")
                # Continue execution even if header check fails, as some model files might be valid without the zip header
                
    except Exception as e:
        raise RuntimeError(f"Error verifying model file: {str(e)}")
    
    # Load model with error handling
    print("[INFO] Loading YOLO model...")
    try:
        print(f"[DEBUG] Attempting to load model with device: {device}")
        print(f"[DEBUG] Model path: {weights_path}")
        print(f"[DEBUG] PyTorch CUDA available: {torch.cuda.is_available()}")
        if torch.cuda.is_available():
            print(f"[DEBUG] CUDA device count: {torch.cuda.device_count()}")
            for i in range(torch.cuda.device_count()):
                print(f"[DEBUG] CUDA device {i}: {torch.cuda.get_device_name(i)}")
        model = attempt_load(weights_path, map_location=device)
        model.eval()  # Set to evaluation mode
        print("[SUCCESS] Model loaded successfully")
    except Exception as e:
        raise RuntimeError(f"Failed to load model: {str(e)}")

    stride = int(model.stride.max())
    imgsz = check_img_size(imgsz, s=stride)
    if half:
        model.half()

    # Get names
    names = model.module.names if hasattr(model, 'module') else model.names

    # Set Dataloader
    vid_path, vid_writer = None, None
    if webcam:
        view_img = check_imshow() if view_img else False
        cudnn.benchmark = True
        dataset = LoadStreams(source, img_size=imgsz, stride=stride, max_frames=opt.max_frames)
        total_frames = opt.max_frames if opt.max_frames > 0 else float('inf')
    else:
        dataset = LoadImages(source, img_size=imgsz, stride=stride, frame_skip=opt.frame_skip)
        total_frames = dataset.nframes if hasattr(dataset, 'nframes') else 0

    # Initialize statistics
    t0 = time.time()
    frame_count = 0
    processed_frames = 0
    total_detections = 0
    max_people_frame = 0
    min_people_frame = float('inf')
    fps_stats = []
    
    # Crowd level tracking
    crowd_levels = {'green': 0, 'yellow': 0, 'red': 0}
    
    # Initialize CSV tracking
    csv_file = open(csv_path, 'w', newline='')
    csv_writer = csv.writer(csv_file)
    csv_writer.writerow(['frame_id', 'timestamp', 'people_count', 'color_level', 'density_name', 'current_max', 'threshold_30', 'threshold_60'])

    # Run inference warmup
    if device.type != 'cpu':
        model(torch.zeros(1, 3, imgsz, imgsz).to(device).type_as(next(model.parameters())))
    
    print(f"Processing video with confidence threshold: {opt.conf_thres}")
    print(f"Total frames to process: {total_frames}")
    print(f"Frame skip: {opt.frame_skip} (processing every {opt.frame_skip} frame(s))")
    print("Starting detection...\n")
    
    # Add flag for clean exit
    should_exit = False
    
    # Process all frames
    for path, img, im0s, vid_cap in dataset:
        # Check exit flag at start of loop
        if should_exit:
            print("\nExiting processing loop...")
            break
            
        frame_count += 1
        
        # Stop if max frames reached
        if opt.max_frames > 0 and processed_frames >= opt.max_frames:
            print(f"\nReached maximum frames limit ({opt.max_frames})")
            break
        
        processed_frames += 1
        t1 = time_synchronized()

        try:
            # Process image
            img_tensor = torch.from_numpy(img).to(device)
            img_tensor = img_tensor.half() if half else img_tensor.float()
            img_tensor /= 255.0
            if img_tensor.ndimension() == 3:
                img_tensor = img_tensor.unsqueeze(0)

            # Inference
            pred = model(img_tensor, augment=opt.augment)[0]

            # Apply NMS
            pred = non_max_suppression(pred, opt.conf_thres, opt.iou_thres, classes=opt.classes, agnostic=opt.agnostic_nms)
            t2 = time_synchronized()
            
        except Exception as e:
            print(f"Error processing frame {frame_count}: {e}")
            continue

        # Process detections
        for i, det in enumerate(pred):
            if webcam:
                p, s, im0, frame = path[i], '%g: ' % i, im0s[i].copy(), dataset.count
            else:
                p, s, im0, frame = path, '', im0s, getattr(dataset, 'frame', 0)

            p = Path(p)
            s += '%gx%g ' % img_tensor.shape[2:]
            gn = torch.tensor(im0.shape)[[1, 0, 1, 0]]
            
            # Set save paths based on mode
            if dataset.mode == 'image':
                save_path = str(processed_dir / f"{base_filename}.jpg")
            else:
                save_path = str(video_path)
            
            # Count people in this frame
            n_people = len(det) if det is not None else 0
            
            # Get color for this frame (based on previous frame count with 1-frame lag)
            crowd_color, crowd_level, density_name = color_mapper.get_color_for_frame(n_people)
            
            # Get current thresholds
            thresholds = color_mapper.get_thresholds()
            
            # Track crowd levels
            crowd_levels[crowd_level] += 1
            
            if len(det):
                # Rescale boxes
                det[:, :4] = scale_coords(img_tensor.shape[2:], det[:, :4], im0.shape).round()

                # Draw bounding boxes with dynamic crowd-based color
                for *xyxy, conf, cls in reversed(det):
                    if opt.save_txt:
                        xywh = (xyxy2xywh(torch.tensor(xyxy).view(1, 4)) / gn).view(-1).tolist()
                        line = (cls, *xywh, conf) if opt.save_conf else (cls, *xywh)
                        # Save labels in tracking directory
                        label_path = tracking_dir / f"{base_filename}_labels.txt"
                        with open(label_path, 'a') as f:
                            f.write(('%g ' * len(line)).rstrip() % line + '\n')

                    if save_img or view_img:
                        # Use dynamic crowd-based color (1-frame lag)
                        plot_one_box(xyxy, im0, label=None, color=crowd_color, line_thickness=2)

            # Update statistics
            total_detections += n_people
            max_people_frame = max(max_people_frame, n_people)
            if n_people > 0:
                min_people_frame = min(min_people_frame, n_people)
            
            # Calculate FPS
            inference_time = t2 - t1
            fps = 1.0 / inference_time if inference_time > 0 else 0
            fps_stats.append(fps)

            # Draw frame info (original format + level info)
            cv2.putText(im0, f'Frame: {frame_count}', (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            cv2.putText(im0, f'People: {n_people}', (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            cv2.putText(im0, f'Level: {density_name}', (10, 110), cv2.FONT_HERSHEY_SIMPLEX, 1, crowd_color, 2)
            cv2.putText(im0, f'Max: {color_mapper.current_max}', (10, 150), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            cv2.putText(im0, f'FPS: {fps:.1f}', (10, 190), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            cv2.putText(im0, f'Conf: {opt.conf_thres}', (10, 230), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

            # Calculate timestamp
            timestamp_val = frame_count / (vid_cap.get(cv2.CAP_PROP_FPS) if vid_cap else 30.0)
            
            # Write to CSV
            csv_writer.writerow([
                frame_count, 
                f"{timestamp_val:.3f}", 
                n_people, 
                crowd_level, 
                density_name,
                color_mapper.current_max,
                thresholds['green_max'],
                thresholds['yellow_max']
            ])
            
            # Emit structured data line for real-time Node.js buffer
            data_line = json.dumps({
                "f": frame_count,
                "t": round(timestamp_val, 3),
                "c": n_people,
                "l": crowd_level,
                "d": density_name,
                "m": color_mapper.current_max,
                "t30": thresholds['green_max'],
                "t60": thresholds['yellow_max']
            })
            print(f"[DATA]{data_line}", flush=True)

            # Display results
            if view_img:
                try:
                    # Add progress info for streams
                    if total_frames == float('inf'):
                        cv2.putText(im0, 'Press Q to quit, S to save frame', 
                                  (10, 270), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
                    
                    cv2.imshow('Dynamic Crowd Detection', im0)
                    key = cv2.waitKey(1) & 0xFF
                    
                    if key == ord('q') or key == ord('Q'):
                        print("\nUser requested to quit")
                        should_exit = True
                        break  # Break from detection loop
                        
                    elif key == ord('s') or key == ord('S'):
                        # Save frame in alert directory
                        alert_save_path = alert_dir / f"{base_filename}_frame{frame_count:05d}.jpg"
                        cv2.imwrite(str(alert_save_path), im0)
                        print(f"\nSaved alert frame to {alert_save_path}")
                        
                except Exception as e:
                    if frame_count == 1:
                        print(f"Warning: Could not show frame: {e}")
                        print("Continuing without display...")
                    view_img = False


            # Save frame for web streaming if enabled
            if getattr(opt, 'stream_frames', False):
                try:
                    stream_frame_path = stream_dir / 'latest.jpg'
                    cv2.imwrite(str(stream_frame_path), im0, [cv2.IMWRITE_JPEG_QUALITY, 85])
                except Exception as e:
                    if frame_count == 1:
                        print(f"Warning: Could not save stream frame: {e}")

            # Auto-save alert frame when crowd level is HIGH (red)
            if crowd_level == 'red':
                existing_alerts = list(alert_dir.glob(f"{base_filename}*.jpg"))
                if len(existing_alerts) < 20:  # Cap at 20 alert frames per job
                    alert_save_path = alert_dir / f"{base_filename}_frame{frame_count:05d}.jpg"
                    try:
                        cv2.imwrite(str(alert_save_path), im0, [cv2.IMWRITE_JPEG_QUALITY, 90])
                        if len(existing_alerts) == 0:
                            print(f"\n[ALERT] HIGH crowd density! Saved alert frame to {alert_save_path}")
                    except Exception as e:
                        print(f"Warning: Could not save alert frame: {e}")

            # Save results
            if save_img:
                if dataset.mode == 'image':
                    save_path = str(processed_dir / f'{Path(source).stem}_result.jpg')
                    cv2.imwrite(save_path, im0)
                    print(f'Results saved to {save_path}')
                else:  # 'video' or 'stream'
                    save_path = str(processed_dir / f'{Path(source).stem}_result.mp4')
                    if vid_path != save_path:  # new video
                        vid_path = save_path
                        if isinstance(vid_writer, cv2.VideoWriter):
                            vid_writer.release()  # release previous video writer
                        if vid_cap:  # video
                            fps = vid_cap.get(cv2.CAP_PROP_FPS)
                            w = int(vid_cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                            h = int(vid_cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                        else:  # stream
                            fps, w, h = 30, im0.shape[1], im0.shape[0]
                        vid_writer = cv2.VideoWriter(save_path, cv2.VideoWriter_fourcc(*'mp4v'), fps, (w, h))
                    vid_writer.write(im0)
        
        # Check exit flag after inner loop
        if should_exit:
            break

    # Calculate final statistics
    total_time = time.time() - t0
    avg_fps = processed_frames / total_time if total_time > 0 else 0
    avg_people = total_detections / processed_frames if processed_frames > 0 else 0
    min_people_frame = min_people_frame if min_people_frame != float('inf') else 0
    
    # Clean up streams if using LoadStreams
    if webcam and hasattr(dataset, 'stop'):
        print('\\n[INFO] Cleaning up stream resources...')
        dataset.stop()
        print('[INFO] Stream cleanup complete')

    # Print detailed final statistics
    print('\n' + '='*70)
    print('FINAL DYNAMIC CROWD ANALYSIS STATISTICS')
    print('='*70)
    print(f'Processing Summary:')
    if total_frames != float('inf'):
        print(f'  Total video frames: {total_frames}')
    print(f'  Frames processed: {processed_frames}')
    print(f'  Frame skip ratio: 1/{opt.frame_skip}')
    print(f'  Processing time: {total_time:.1f}s')
    print(f'  Average FPS: {avg_fps:.1f}')
    print()
    print(f'Crowd Detection Summary:')
    print(f'  Base maximum: {opt.base_max}')
    print(f'  Final maximum detected: {color_mapper.current_max}')
    print(f'  Total people detected: {total_detections}')
    print(f'  Average people per frame: {avg_people:.1f}')
    print(f'  Maximum people in frame: {max_people_frame}')
    print(f'  Minimum people in frame: {min_people_frame}')
    print(f'  Confidence threshold: {opt.conf_thres}')
    print()
    print(f'Dynamic Color Distribution (1-frame lag):')
    total_processed = sum(crowd_levels.values())
    for level, count in crowd_levels.items():
        percentage = (count / total_processed * 100) if total_processed > 0 else 0
        level_name = {'green': 'LOW', 'yellow': 'MODERATE', 'red': 'HIGH'}[level]
        print(f'  {level_name} ({level.upper()}): {count} frames ({percentage:.1f}%)')
    print('='*70)

    # Cleanup
    if isinstance(vid_writer, cv2.VideoWriter):
        vid_writer.release()
    
    try:
        cv2.destroyAllWindows()
    except:
        pass
    
    csv_file.close()
    
    print("\nResults saved to:")
    if vid_writer is not None and processed_frames > 0:
        print(f"- Processed video: {video_path}")
    print(f"- Crowd tracking data: {csv_path}")
    if os.path.exists(alert_dir):
        n_alerts = len(list(alert_dir.glob(f"{base_filename}*.jpg")))
        if n_alerts > 0:
            print(f"- Alert frames: {n_alerts} frames saved in {alert_dir}")

if __name__ == '__main__':
    def parse_opt():
        parser = argparse.ArgumentParser(description='YOLOv5 Crowd Detection with Dynamic Color Coding')
        parser.add_argument('--weights', nargs='+', type=str, default='yolo-crowd.pt', 
                          help='path to model weights file (default: yolo-crowd.pt)')
        parser.add_argument('--source', type=str, default='data/images', 
                          help='source (file/folder path, 0 for webcam, or URL)')
        parser.add_argument('--output', type=str, default='runs/detect', 
                          help='output directory for processed files (default: runs/detect)')
        parser.add_argument('--img-size', type=int, default=640, 
                          help='inference size (pixels, default: 640)')
        parser.add_argument('--conf-thres', type=float, default=0.25, 
                          help='object confidence threshold (default: 0.25)')
        parser.add_argument('--iou-thres', type=float, default=0.45, 
                          help='IOU threshold for NMS (default: 0.45)')
        parser.add_argument('--device', default='cpu' if not torch.cuda.is_available() else '0', 
                          help='device to run on (default: 0 for GPU if available, else CPU)')
        parser.add_argument('--view-img', action='store_true', help='display results')
        parser.add_argument('--save-txt', action='store_true', help='save results to *.txt')
        parser.add_argument('--save-conf', action='store_true', help='save confidences in --save-txt labels')
        parser.add_argument('--nosave', action='store_true', help='do not save images/videos')
        parser.add_argument('--classes', nargs='+', type=int, help='filter by class')
        parser.add_argument('--agnostic-nms', action='store_true', help='class-agnostic NMS')
        parser.add_argument('--augment', action='store_true', help='augmented inference')
        parser.add_argument('--project', default='runs/detect', help='save results to project/name')
        parser.add_argument('--name', default='exp', help='save results to project/name')
        parser.add_argument('--exist-ok', action='store_true', help='existing project/name ok, do not increment')
        parser.add_argument('--frame-skip', type=int, default=1, help='process every Nth frame (1=all frames)')
        parser.add_argument('--max-frames', type=int, default=0, help='maximum frames to process (0=all)')
        parser.add_argument('--base-max', type=int, default=15, help='base maximum for color coding')
        parser.add_argument('--stream-frames', action='store_true', help='save frames for web streaming')
        
        opt = parser.parse_args()
        return opt

    opt = parse_opt()
    print("=== DYNAMIC CROWD DETECTION SYSTEM ===")
    print(opt)
    
    print("\nChecking requirements...")
    try:
        check_requirements(exclude=('pycocotools', 'thop'))
        print("Requirements check passed")
    except Exception as e:
        print(f"Requirements check failed: {e}")
        exit(1)

    with torch.no_grad():
        detect()