import React, { useState } from 'react';

interface StarRatingProps {
  value: number;                 // điểm hiện tại (0-5, có thể lẻ khi hiển thị)
  onChange?: (v: number) => void; // có → cho phép chọn (tương tác)
  size?: number;                  // cỡ bông sen (px)
  readOnly?: boolean;
  className?: string;
}

/**
 * Thanh đánh giá hoa sen ❀ kiểu Cố đô.
 * - Hiển thị: ❀ vàng kim (đầy) / xám (rỗng) theo điểm.
 * - Tương tác: rê chuột → bông sen phóng to nhẹ + tỏa quầng sáng vàng (glow).
 */
export const StarRating: React.FC<StarRatingProps> = ({
  value,
  onChange,
  size = 22,
  readOnly,
  className = '',
}) => {
  const [hover, setHover] = useState(0);
  const interactive = !!onChange && !readOnly;
  const display = hover || value;

  return (
    <div
      className={`inline-flex items-center gap-1 select-none ${className}`}
      role={interactive ? 'radiogroup' : undefined}
      aria-label="Đánh giá sao"
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const active = i <= Math.round(display);
        const isPeak = interactive && i === display;
        return (
          <button
            key={i}
            type="button"
            disabled={!interactive}
            onClick={() => interactive && onChange!(i)}
            onMouseEnter={() => interactive && setHover(i)}
            onMouseLeave={() => interactive && setHover(0)}
            aria-label={`${i} sao`}
            className={`leading-none transition-all duration-200 ease-out ${
              interactive ? 'cursor-pointer hover:scale-125' : 'cursor-default'
            } ${active ? 'text-brand-gold' : 'text-zinc-300'}`}
            style={{
              fontSize: size,
              transform: isPeak ? 'scale(1.2)' : undefined,
              filter: active ? 'drop-shadow(0 0 5px rgba(184,138,85,0.75))' : 'none',
            }}
          >
            ❀
          </button>
        );
      })}
    </div>
  );
};
