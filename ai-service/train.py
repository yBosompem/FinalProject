#!/usr/bin/env python3
"""
Train YOLO26 for exam proctoring object detection.

Examples:
  python train.py
  python train.py --data data/proctoring.yaml --epochs 50
  python train.py --model yolo26n.yaml --weights yolo26n.pt
"""

from __future__ import annotations

import argparse
from pathlib import Path

from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent
DEFAULT_DATA = ROOT / 'data' / 'proctoring.yaml'


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Train YOLO26 for proctoring detection')
    parser.add_argument('--model', default='yolo26n.pt', help='Base weights or YAML (default: yolo26n.pt)')
    parser.add_argument('--weights', default=None, help='Optional weights to transfer when building from YAML')
    parser.add_argument('--data', default=str(DEFAULT_DATA), help='Dataset YAML path')
    parser.add_argument('--epochs', type=int, default=100)
    parser.add_argument('--imgsz', type=int, default=640)
    parser.add_argument('--batch', type=int, default=16)
    parser.add_argument('--device', default=None, help='cuda device id or cpu')
    parser.add_argument('--name', default='proctoring', help='Run name under runs/detect/')
    return parser.parse_args()


def load_model(model_arg: str, weights: str | None) -> YOLO:
    path = Path(model_arg)
    if path.suffix == '.yaml':
        model = YOLO(str(path))
        if weights:
            model.load(weights)
        return model
    return YOLO(model_arg)


def main() -> None:
    args = parse_args()
    data_path = Path(args.data)
    if not data_path.is_absolute():
        data_path = ROOT / data_path

    if not data_path.exists():
        raise FileNotFoundError(
            f'Dataset config not found: {data_path}\n'
            'Use data/coco8.yaml for a smoke test or prepare data/proctoring.yaml.'
        )

    model = load_model(args.model, args.weights)

    results = model.train(
        data=str(data_path),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        project=str(ROOT / 'runs' / 'detect'),
        name=args.name,
    )

    best = ROOT / 'runs' / 'detect' / args.name / 'weights' / 'best.pt'
    deploy = ROOT / 'weights' / 'proctoring.pt'
    deploy.parent.mkdir(parents=True, exist_ok=True)
    if best.exists():
        deploy.write_bytes(best.read_bytes())
        print(f'\nDeployed best weights to {deploy}')

    print('\nTraining complete.')
    return results


if __name__ == '__main__':
    main()
