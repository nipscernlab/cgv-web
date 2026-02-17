use wasm_bindgen::prelude::*;
use wasm_bindgen::Clamped;

#[inline(always)]
fn blend_pixel(
    base: *mut u8,
    overlay: *const u8,
) {
    unsafe {
        let oa = *overlay.add(3) as u32;
        if oa == 0 {
            return;
        }

        let inv = 255 - oa;

        // R
        let o0 = *overlay.add(0) as u32;
        let b0 = *base.add(0) as u32;
        *base.add(0) = ((o0 * oa + b0 * inv) / 255) as u8;

        // G
        let o1 = *overlay.add(1) as u32;
        let b1 = *base.add(1) as u32;
        *base.add(1) = ((o1 * oa + b1 * inv) / 255) as u8;

        // B
        let o2 = *overlay.add(2) as u32;
        let b2 = *base.add(2) as u32;
        *base.add(2) = ((o2 * oa + b2 * inv) / 255) as u8;

        // Alpha correto
        let ba = *base.add(3) as u32;
        *base.add(3) = (oa + (ba * inv) / 255).min(255) as u8;
    }
}

#[wasm_bindgen]
pub fn composite_rgba(
    mut base: Clamped<Vec<u8>>,
    base_w: u32,
    base_h: u32,
    overlay: Clamped<Vec<u8>>,
    ov_w: u32,
    ov_h: u32,
    pos_x: u32,
    pos_y: u32,
) -> Clamped<Vec<u8>> {

    let base_w = base_w as usize;
    let base_h = base_h as usize;
    let ov_w = ov_w as usize;
    let ov_h = ov_h as usize;

    let px = pos_x as usize;
    let py = pos_y as usize;

    if px >= base_w || py >= base_h {
        return base;
    }

    let base_buf = base.0.as_mut_ptr();
    let ov_buf = overlay.0.as_ptr();

    let max_y = (py + ov_h).min(base_h);
    let max_x = (px + ov_w).min(base_w);

    for y in py..max_y {
        let oy = y - py;

        let base_row = y * base_w * 4;
        let ov_row = oy * ov_w * 4;

        for x in px..max_x {
            let ox = x - px;

            let b_idx = base_row + x * 4;
            let o_idx = ov_row + ox * 4;

            unsafe {
                blend_pixel(
                    base_buf.add(b_idx),
                    ov_buf.add(o_idx),
                );
            }
        }
    }

    base
}
