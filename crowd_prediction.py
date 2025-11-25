#!/usr/bin/env python3
"""
crowd_predict_and_forecast.py

Usage:
    python crowd_predict_and_forecast.py
    python crowd_predict_and_forecast.py --csv runs/detect/crowd_tracking.csv --future 10 --out runs/detect/crowd_predictions_with_future.csv
"""
import argparse
import math
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error
import matplotlib.pyplot as plt

def choose_window_size(n_rows: int) -> int:
    """
    Heuristic to pick a window size that gives enough training samples.
    If you truly want window_size = n_rows - 1, set --force-full-window.
    """
    if n_rows <= 3:
        return max(1, n_rows - 1)
    if n_rows <= 10:
        return max(1, n_rows // 2)    # small files: use half
    if n_rows <= 50:
        return min(5, n_rows - 1)     # moderate files: use 5
    return min(10, n_rows - 1)        # larger files: use up to 10


def main(args):
    csv_path = Path(args.csv)
    if not csv_path.exists():
        raise SystemExit(f"CSV not found: {csv_path}")

    df = pd.read_csv(csv_path)
    print("Loaded CSV:", csv_path, "rows:", len(df))
    # tolerant column name
    if "people_count" in df.columns:
        col_name = "people_count"
    elif "count" in df.columns:
        col_name = "count"
    elif "people" in df.columns:
        col_name = "people"
    else:
        raise SystemExit("No people count column found. Expected one of: 'people_count','count','people'")

    # coerce numeric and drop NaNs
    df = df.copy()
    df[col_name] = pd.to_numeric(df[col_name], errors="coerce")
    df = df.dropna(subset=[col_name]).reset_index(drop=True)
    df[col_name] = df[col_name].astype(float)

    n = len(df)
    if n < 2:
        raise SystemExit("Need at least 2 rows to make predictions.")

    # window selection
    if args.force_full_window:
        window_size = n - 1
    else:
        window_size = choose_window_size(n)
    print(f"Chosen window_size = {window_size} (rows = {n})")

    # Build sliding windows
    X_list, y_list = [], []
    for i in range(window_size, n):
        window = df[col_name].iloc[i - window_size:i].values.astype(float)
        X_list.append(window)
        y_list.append(float(df[col_name].iloc[i]))

    X = np.array(X_list)  # shape (n-window_size, window_size)
    y = np.array(y_list)  # shape (n-window_size,)
    print(f"Built dataset X.shape={X.shape}, y.shape={y.shape}")

    if X.shape[0] == 0:
        raise SystemExit("No training samples were built. Reduce WINDOW or provide more rows in CSV.")

    # Train linear regression on all samples (in-sample predictions)
    model = LinearRegression()
    model.fit(X, y)
    preds = model.predict(X)

    # In-sample evaluation
    mae = mean_absolute_error(y, preds)
    rmse = math.sqrt(mean_squared_error(y, preds))
    print(f"In-sample MAE={mae:.3f}, RMSE={rmse:.3f}")

    # Build result DataFrame aligned with original frame indices
    # The samples correspond to df rows starting at index = window_size
    result_df = df.iloc[window_size:].copy().reset_index(drop=True)
    result_df = result_df.assign(actual_count = y, predicted_count = preds)

    # Future forecasting
    future_steps = args.future
    last_window = df[col_name].iloc[-window_size:].values.astype(float)
    future_preds = []
    for step in range(future_steps):
        next_pred = float(model.predict(last_window.reshape(1, -1))[0])
        future_preds.append(next_pred)
        # slide the window
        last_window = np.roll(last_window, -1)
        last_window[-1] = next_pred

    # Create future dataframe: frame_id and timestamp handling
    last_frame_id = None
    if "frame_id" in df.columns:
        try:
            last_frame_id = int(df["frame_id"].iloc[-1])
        except Exception:
            last_frame_id = None

    if "timestamp" in df.columns:
        try:
            last_ts = float(df["timestamp"].iloc[-1])
            # compute typical delta (fallback to 1/25)
            deltas = df["timestamp"].diff().dropna()
            delta = float(deltas.median()) if not deltas.empty else (1.0 / 25.0)
        except Exception:
            last_ts = None
            delta = 1.0 / 25.0
    else:
        last_ts = None
        delta = 1.0 / 25.0

    future_rows = []
    for i, p in enumerate(future_preds, start=1):
        fid = (last_frame_id + i) if last_frame_id is not None else (n + i)
        ts = (last_ts + i * delta) if last_ts is not None else None
        future_rows.append({
            "frame_id": fid,
            "timestamp": ts,
            "actual_count": np.nan,
            "predicted_count": p
        })
    future_df = pd.DataFrame(future_rows)

    # Combine historical predictions and future forecast
    output_df = pd.concat([result_df[["frame_id", "timestamp", "actual_count", "predicted_count"]], future_df], ignore_index=True)

    # Save CSV
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    output_df.to_csv(out_path, index=False)
    print("Saved predictions + future to:", out_path)

    # Plotting
    plt.figure(figsize=(12, 5))
    # plot actuals (historical)
    plt.plot(output_df["frame_id"].iloc[:len(result_df)], output_df["actual_count"].iloc[:len(result_df)], label="Actual (hist)", marker='o')
    # plot predicted for historical part
    plt.plot(output_df["frame_id"].iloc[:len(result_df)], output_df["predicted_count"].iloc[:len(result_df)], label="Predicted (hist)", linestyle='--', marker='x')
    # plot future predictions
    plt.plot(output_df["frame_id"].iloc[len(result_df):], output_df["predicted_count"].iloc[len(result_df):], label=f"Forecast next {future_steps}", linestyle=':', marker='s')
    # vertical line marking forecast start
    if len(result_df) > 0:
        vline_x = int(output_df["frame_id"].iloc[len(result_df) - 1])
        plt.axvline(x=vline_x, color='red', linestyle=':', label='Forecast start')

    plt.xlabel("Frame ID")
    plt.ylabel("People Count")
    plt.title("Actual vs Predicted Crowd Count (with Forecast)")
    plt.legend()
    plt.grid(True)
    fig_path = out_path.with_suffix('.png')
    plt.tight_layout()
    plt.savefig(fig_path)
    print("Saved plot to:", fig_path)
    # also show inline if desired
    if args.show_plot:
        plt.show()

    # Show small sample
    print("\nSample rows (head of output file):")
    print(output_df.head(15).to_string(index=False))
    print("\nScript finished.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=str, default="runs/detect/crowd_tracking.csv", help="input CSV path (frame_id,timestamp,people_count)")
    parser.add_argument("--future", type=int, default=10, help="number of future frames to forecast")
    parser.add_argument("--out", type=str, default="runs/detect/crowd_predictions_with_future.csv", help="output CSV path")
    parser.add_argument("--show-plot", action="store_true", help="show plot interactively")
    parser.add_argument("--force-full-window", action="store_true", help="force window size = rows-1 (may produce only one sample)")
    args = parser.parse_args()
    main(args)
