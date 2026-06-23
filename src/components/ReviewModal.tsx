import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StarRating } from './StarRating';

interface ReviewModalProps {
  productId: string;
  productName: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

/** Hộp thoại đánh giá sản phẩm — mở khi khách đã mua bấm nút "Đánh giá". */
export const ReviewModal: React.FC<ReviewModalProps> = ({ productId, productName, onClose, onSubmitted }) => {
  const { addToast, navigateTo } = useApp();
  const [rating, setRating] = useState(5);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const token = localStorage.getItem('huegifts_user_token') || sessionStorage.getItem('huegifts_user_token');

  // Nạp sẵn đánh giá cũ (nếu đã từng đánh giá) để sửa
  useEffect(() => {
    if (!token) return;
    fetch(`/api/products/${productId}/reviews`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.auth?.myReview) {
          setRating(d.auth.myReview.rating);
          setMessage(d.auth.myReview.message || '');
        }
      })
      .catch(() => {});
  }, [productId]);

  const submit = async () => {
    if (!token) {
      addToast('Vui lòng đăng nhập để đánh giá ạ.', 'info');
      navigateTo('profile');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/products/${productId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating, message }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(data.updated ? 'Đã cập nhật đánh giá. Cảm ơn bạn!' : 'Cảm ơn bạn đã đánh giá! 🌸', 'success');
        onSubmitted?.();
        onClose();
      } else {
        addToast(data.error || 'Không gửi được đánh giá.', 'error');
      }
    } catch {
      addToast('Lỗi kết nối khi gửi đánh giá.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 font-sans" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="pr-4">
            <h4 className="font-serif font-semibold text-base text-text-charcoal">Đánh giá sản phẩm</h4>
            <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{productName}</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 cursor-pointer shrink-0" aria-label="Đóng">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <StarRating value={rating} onChange={setRating} size={32} />
          <span className="text-xs font-semibold text-brand-gold">{rating}/5</span>
        </div>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="Chia sẻ cảm nhận của bạn về sản phẩm để mọi người cùng biết ạ..."
          className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-brand-purple focus:bg-white focus:outline-none text-text-charcoal mb-4"
        />

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-text-charcoal cursor-pointer transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="text-xs font-bold uppercase tracking-wider px-5 py-2 rounded-lg bg-brand-purple hover:bg-brand-purple/90 disabled:bg-zinc-400 text-white cursor-pointer transition-colors"
          >
            {submitting ? 'Đang gửi...' : 'Gửi đánh giá'}
          </button>
        </div>
      </div>
    </div>
  );
};
