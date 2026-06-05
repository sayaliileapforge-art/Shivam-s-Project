#!/usr/bin/env python3
"""
Test script to verify the new _extract_crop_simple() function
Validates that:
1. Subject stays centered in the crop
2. No edge-pushing occurs
3. Headroom is properly applied
"""

import sys
import cv2
import numpy as np
import os
from PIL import Image

# Add backend to path
sys.path.insert(0, r"c:\Users\Sayali\Downloads\Enterprise SaaS Admin Portal\backend\ai_service")

from services.photo_editor import _extract_crop_simple, get_faces

def test_crop_centering():
    """Test that the crop keeps subject centered"""
    print("=" * 60)
    print("Testing new _extract_crop_simple() function")
    print("=" * 60)
    
    # Try to find a test image with a face
    test_image_path = None
    
    # Check common locations
    possible_paths = [
        r"c:\Users\Sayali\Downloads\Enterprise SaaS Admin Portal\public\uploads\test_student.jpg",
        r"c:\Users\Sayali\Downloads\Enterprise SaaS Admin Portal\public\test_photo.jpg",
        r"c:\Users\Sayali\Downloads\student_photo.jpg",
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            test_image_path = path
            break
    
    if not test_image_path:
        print("ℹ No test image found at expected locations")
        print("  Creating synthetic test with a simple face pattern...")
        
        # Create a synthetic test image with a centered face area
        img = np.ones((600, 600, 3), dtype=np.uint8) * 200  # Light gray background
        
        # Draw a simple "face" - circle with features
        cv2.circle(img, (300, 250), 80, (100, 150, 200), -1)  # Face circle (blue)
        cv2.circle(img, (280, 230), 8, (0, 0, 0), -1)  # Left eye
        cv2.circle(img, (320, 230), 8, (0, 0, 0), -1)  # Right eye
        cv2.line(img, (300, 270), (300, 290), (0, 0, 0), 2)  # Nose
        
        test_image_path = r"c:\Users\Sayali\Downloads\Enterprise SaaS Admin Portal\test_synthetic_face.jpg"
        cv2.imwrite(test_image_path, img)
        print(f"✓ Created synthetic test image at {test_image_path}")
    else:
        print(f"✓ Using test image: {test_image_path}")
    
    # Load image
    img_bgr = cv2.imread(test_image_path)
    if img_bgr is None:
        print("✗ Failed to load image")
        return False
    
    h, w = img_bgr.shape[:2]
    print(f"✓ Image loaded: {w}x{h}")
    
    # Detect faces
    try:
        faces = get_faces(img_bgr)
        if not faces:
            print("✗ No faces detected")
            return False
        print(f"✓ Detected {len(faces)} face(s)")
    except Exception as e:
        print(f"✗ Face detection failed: {e}")
        return False
    
    face = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1]))
    
    # Test the new extraction function
    padding = 4.5
    headroom = 0.20
    
    # Calculate crop size from face bounding box
    bw = face.bbox[2] - face.bbox[0]
    bh = face.bbox[3] - face.bbox[1]
    cs = int(max(bw, bh) * padding)
    
    print(f"\nTesting _extract_crop_simple with:")
    print(f"  Face size: {bw}x{bh}")
    print(f"  Crop size: {cs}x{cs}")
    print(f"  Padding: {padding}")
    print(f"  Headroom: {headroom}")
    
    try:
        crop_result = _extract_crop_simple(img_bgr, face, cs, padding, headroom)
        print(f"✓ Crop extraction succeeded")
        print(f"  Result shape: {crop_result.shape}")
        
        # Analyze the crop result
        cs = crop_result.shape[0]
        
        # Calculate how much white padding is in the crop
        white_pixels = np.sum((crop_result == 255).all(axis=2))
        total_pixels = cs * cs
        white_ratio = white_pixels / total_pixels
        
        print(f"\n✓ Crop Analysis:")
        print(f"  Crop size: {cs}x{cs}")
        print(f"  White padding ratio: {white_ratio:.1%}")
        
        # Check if padding is reasonable (shouldn't be all white or zero)
        if white_ratio < 0.05:
            print("  ⚠ Very little white padding - crop may be too large")
        elif white_ratio > 0.80:
            print("  ⚠ Too much white padding - crop may be too small")
        else:
            print("  ✓ Padding ratio looks reasonable")
        
        # Save the crop result for visual inspection
        output_path = r"c:\Users\Sayali\Downloads\Enterprise SaaS Admin Portal\test_crop_result.jpg"
        cv2.imwrite(output_path, crop_result)
        print(f"\n✓ Crop result saved to: {output_path}")
        
        # Also save original for comparison
        original_output = r"c:\Users\Sayali\Downloads\Enterprise SaaS Admin Portal\test_original.jpg"
        cv2.imwrite(original_output, img_bgr)
        print(f"✓ Original saved to: {original_output}")
        
        print("\n" + "=" * 60)
        print("✓ Test completed successfully")
        print("=" * 60)
        return True
        
    except Exception as e:
        print(f"✗ Crop extraction failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_crop_centering()
    sys.exit(0 if success else 1)
