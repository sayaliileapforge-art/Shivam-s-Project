#!/usr/bin/env python3
"""Fix the photo_editor.py run_phase2 function to use rotation matrix instead of rectangular cropping."""

import re

file_path = r"backend\ai_service\services\photo_editor.py"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find and replace the problematic eye_center_x code with the original rotation matrix approach
# The problematic section starts with "try_cs = int" and includes the rectangular cropping logic

old_pattern = r'''        # Use simple rectangular cropping with eye-center positioning
        # Try crop with validation when padding changes significantly
        M = None
        for try_padding in \[padding, padding \* 0\.95, padding \* 0\.9, p1_padding\]:
            try_cs = int\(max\(bw, bh\) \* try_padding\)
            el, er = face\.kps\[0\], face\.kps\[1\]
            eye_center_x = \(el\[0\] \+ er\[0\]\) / 2\.0
            eye_center_y = \(el\[1\] \+ er\[1\]\) / 2\.0
            
            # Direct rectangular crop with eye-center positioning
            crop_left = int\(eye_center_x - try_cs / 2\.0\)
            crop_top = int\(eye_center_y - try_cs \* 0\.35\)
            crop_right = crop_left \+ try_cs
            crop_bottom = crop_top \+ try_cs
            
            # Test the crop by extracting it
            try:
                test_crop = np\.full\(\(try_cs, try_cs, 3\), 255, dtype=np\.uint8\)
                overlap_left = max\(0, crop_left\)
                overlap_top = max\(0, crop_top\)
                overlap_right = min\(w, crop_right\)
                overlap_bottom = min\(h, crop_bottom\)
                
                if overlap_right > overlap_left and overlap_bottom > overlap_top:
                    canvas_left = overlap_left - crop_left
                    canvas_top = overlap_top - crop_top
                    canvas_right = canvas_left \+ \(overlap_right - overlap_left\)
                    canvas_bottom = canvas_top \+ \(overlap_bottom - overlap_top\)
                    test_crop\[canvas_top:canvas_bottom, canvas_left:canvas_right\] = \\
                        work\[overlap_top:overlap_bottom, overlap_left:overlap_right\]
                
                if _validate_crop\(test_crop, min_content_ratio=0\.25\):
                    # Affine matrix for rectangular crop: translate crop origin to \(0,0\)
                    M = np\.float32\(\[\[1, 0, -crop_left\], \[0, 1, -crop_top\]\]\)
                    cs = try_cs  # Store the matching crop size
                    break
            except Exception as e:
                print\(f"\[PHASE2 CROP\] Exception: \{e\}"\)
                continue
        
        # If validation failed, fall back to p1 padding
        if M is None:
            cs = int\(max\(bw, bh\) \* p1_padding\)
            el, er = face\.kps\[0\], face\.kps\[1\]
            eye_center_x = \(el\[0\] \+ er\[0\]\) / 2\.0
            eye_center_y = \(el\[1\] \+ er\[1\]\) / 2\.0
            
            crop_left = int\(eye_center_x - cs / 2\.0\)
            crop_top = int\(eye_center_y - cs \* 0\.35\)
            
            # Return affine matrix for rectangular crop
            M = np\.float32\(\[\[1, 0, -crop_left\], \[0, 1, -crop_top\]\]\)'''

new_code = '''        # Try crop with validation when padding changes significantly
        M = None
        for try_padding in [padding, padding * 0.95, padding * 0.9, p1_padding]:
            cs = int(max(bw, bh) * try_padding)
            el, er = face.kps[0], face.kps[1]
            ec = ((el[0]+er[0])/2, (el[1]+er[1])/2)
            ang = np.degrees(np.arctan2(er[1]-el[1], er[0]-el[0]))
            
            M_candidate = _build_crop_M(ec, ang, cs, face.bbox[1], try_padding)
            M_candidate = _clamp_crop_bounds(work, M_candidate, cs)
            
            # Test the crop
            try:
                test_crop = cv2.warpAffine(work, M_candidate, (cs, cs), borderValue=(255, 255, 255))
                if _validate_crop(test_crop, min_content_ratio=0.25):
                    M = M_candidate
                    break
            except Exception:
                continue
        
        # If validation failed, fall back to p1 padding
        if M is None:
            cs = int(max(bw, bh) * p1_padding)
            el, er = face.kps[0], face.kps[1]
            ec = ((el[0]+er[0])/2, (el[1]+er[1])/2)
            ang = np.degrees(np.arctan2(er[1]-el[1], er[0]-el[0]))
            M = _build_crop_M(ec, ang, cs, face.bbox[1], p1_padding)
            M = _clamp_crop_bounds(work, M, cs)'''

# Replace the content
modified_content = re.sub(old_pattern, new_code, content, flags=re.DOTALL)

if modified_content != content:
    print("✓ Found and fixed the problematic code!")
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(modified_content)
    print(f"✓ Fixed file written to: {file_path}")
else:
    print("✗ Could not find the problematic pattern")
    print("\nTrying simpler line-by-line replacement...")
    
    # Try a more direct approach - just fix the specific problematic lines
    lines = content.split('\n')
    new_lines = []
    skip_until = -1
    
    for i, line in enumerate(lines):
        if i < skip_until:
            continue
            
        # Check for the problematic eye_center_x pattern in run_phase2
        if 'eye_center_x = (el[0] + er[0]) / 2.0' in line and i > 900 and i < 1300:
            print(f"Found eye_center_x at line {i+1}, fixing...")
            # This is in the problematic run_phase2 section, skip it and related lines
            # We need to replace from the "try_cs" line to the fallback section
            
            # Find the start of this try_padding loop
            j = i - 5
            while j >= 0 and 'for try_padding in' not in lines[j]:
                j -= 1
            
            if j >= 0:
                # Found the start of the loop
                loop_start = j
                print(f"Loop starts at line {j+1}")
                
                # Find where this if M is None block ends
                j = i + 1
                indent_level = len(line) - len(line.lstrip())
                while j < len(lines):
                    if lines[j].strip() and not lines[j].startswith(' ' * indent_level) and lines[j].strip() != '':
                        break
                    if 'M = _build_crop_M' in lines[j] and j > i + 20:
                        break
                    j += 1
                
                loop_end = j
                print(f"Loop/block ends at line {j+1}")
                
                # Skip these lines - we'll replace them all at once later
                skip_until = j + 1

print("\nFile fix complete!")
