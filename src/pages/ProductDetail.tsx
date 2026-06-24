import React, { useState, useEffect } from 'react';
import { Star, Heart, ShoppingBag, Truck, RefreshCw, Layers, Sparkles, AlertCircle, CheckCircle, ChevronDown, MessageSquare } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ProductCard } from '../components/ProductCard';
import { Breadcrumb } from '../components/Breadcrumb';
import { StarRating } from '../components/StarRating';
import type { Review, ReviewSummary } from '../types';

export const ProductDetail: React.FC = () => {
  const { routeParams, wishlist, toggleWishlist, addToCart, navigateTo, addToRecentlyViewed, addToast, products } = useApp();
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [activeAccordion, setActiveAccordion] = useState<string | null>('mota');

  const slug = routeParams?.slug;
  const product = products.find(p => p.slug === slug) || products[0];

  // ─── Đánh giá sản phẩm (chỉ hiển thị; đánh giá thực hiện ở trang đặt hàng thành công) ──
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<ReviewSummary>({ average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  const [starFilter, setStarFilter] = useState<number>(0); // 0 = tất cả

  const loadReviews = (productId: string) => {
    fetch(`/api/products/${productId}/reviews`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        setReviews(data.reviews || []);
        if (data.summary) setSummary(data.summary);
      })
      .catch(() => { setReviews([]); });
  };

  useEffect(() => {
    if (product) {
      setActiveImageIdx(0);
      setQty(1);
      addToRecentlyViewed(product.id);
      setStarFilter(0);
      loadReviews(product.id);
    }
  }, [product]);

  const filteredReviews = starFilter === 0 ? reviews : reviews.filter(r => Math.round(r.rating) === starFilter);

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center font-sans">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-bold">Không tìm thấy sản phẩm</h3>
        <button onClick={() => navigateTo('shop')} className="mt-4 bg-brand-purple text-white px-6 py-2 rounded">
          Trở lại cửa hàng
        </button>
      </div>
    );
  }

  const isFavorited = wishlist.includes(product.id);
  const discountRate = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  const formatPrice = (value: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
  };

  // Up-sell Companion product (Frequent Bought together) - pick another product in the same category or any popular one
  const companionProduct = products.find(p => p.id !== product.id && p.category === product.category) || products.find(p => p.id !== product.id)!;

  // Related products grid - choose up to 4 items in same category, excluding active one
  const relatedProducts = products.filter(p => p.id !== product.id && p.category === product.category).slice(0, 4);

  const handleQtyChange = (val: number) => {
    if (val < 1) return;
    if (val > product.stock) {
      addToast(`Huegifts chỉ còn sẵn thương vụ ${product.stock} gói sản phẩm này thôi ạ.`, 'info');
      return;
    }
    setQty(val);
  };

  const handleBuyNow = () => {
    addToCart(product, qty);
    navigateTo('cart');
  };

  const toggleAccordion = (section: string) => {
    setActiveAccordion(activeAccordion === section ? null : section);
  };

  const formatReviewDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('vi-VN'); } catch { return iso; }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 pb-16 font-sans">
      
      {/* 1. BREADCRUMBS */}
      <Breadcrumb items={[
        { label: 'Cửa hàng', page: 'shop' },
        { label: product.categoryName, page: 'shop' },
        { label: product.name }
      ]} />

      {/* 2. TOP SPLIT ROW: IMAGES GALLERY & CORE SPECIFICATIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12 mb-16">
        
        {/* GALLERY WORK DESKTOP LOGIC (L.Col 5/12) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="relative aspect-square rounded-2xl overflow-hidden bg-white shadow-xs border border-zinc-200/50">
            {discountRate > 0 && (
              <span className="absolute top-4 left-4 bg-brand-gold text-white text-[10px] bg-brand-gold font-bold tracking-wider uppercase px-2 py-0.5 rounded shadow-sm z-10">
                Giảm {discountRate}%
              </span>
            )}
            <img
              src={product.images[activeImageIdx] || product.images[0]}
              alt={product.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>

          {/* Thumbnails list */}
          {product.images.length > 1 && (
            <div className="flex space-x-3">
              {product.images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImageIdx(idx)}
                  className={`w-20 h-20 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                    activeImageIdx === idx ? 'border-brand-purple shadow-sm scale-102' : 'border-zinc-200 opacity-70 hover:opacity-100'
                  }`}
                  id={`thumb-image-${idx}`}
                >
                  <img src={img} alt={`${product.name} thumb ${idx}`} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* DETAILS SPECIFICATIONS COLUMN (R.Col 6/12) */}
        <div className="lg:col-span-6 flex flex-col justify-between">
          <div className="space-y-4">
            
            {/* Tag classification banner */}
            <div className="flex items-center space-x-2">
              <span className="text-[10px] text-brand-purple font-semibold tracking-wider bg-brand-purple-light px-2.5 py-1 rounded">
                ❀ {product.categoryName}
              </span>
              {product.isBestSeller && (
                <span className="text-[10px] text-brand-gold font-semibold tracking-wider bg-brand-gold-light px-2.5 py-1 rounded">
                  ★ Bán chạy
                </span>
              )}
            </div>

            {/* Name */}
            <h1 className="text-2xl md:text-3xl font-serif font-medium text-text-charcoal tracking-tight leading-snug">
              {product.name}
            </h1>

            {/* Ratings & reviews index — dùng số liệu đánh giá thật */}
            <div className="flex items-center space-x-3.5 border-b border-zinc-200/50 pb-4">
              {summary.count > 0 ? (
                <>
                  <div className="flex items-center text-brand-gold">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-4 h-4 shrink-0 ${
                          i < Math.floor(summary.average) ? 'fill-current' : 'text-zinc-300'
                        }`}
                      />
                    ))}
                    <span className="text-xs font-semibold font-sans text-text-charcoal ml-1.5">{summary.average.toFixed(1)}</span>
                  </div>
                  <span className="text-xs text-text-muted">|</span>
                  <span className="text-xs text-text-muted">({summary.count} lượt bạn hữu dột sương hồi âm lại)</span>
                  <span className="text-xs text-text-muted">|</span>
                </>
              ) : (
                <>
                  <span className="text-xs text-text-muted/70 italic">Chưa có đánh giá</span>
                  <span className="text-xs text-text-muted">|</span>
                </>
              )}
              <span className={`text-[11px] font-bold ${product.stock > 0 ? 'text-brand-green' : 'text-red-500'}`}>
                {product.stock > 0 ? `Sẵn bưu cục (${product.stock} món)` : 'Tạm hết mẫu'}
              </span>
            </div>

            {/* Price Box */}
            <div className="flex items-baseline space-x-4 bg-[#F2ECE0]/60 p-4 rounded-xl border border-zinc-150">
              <span className="text-2xl md:text-3xl font-bold text-brand-purple font-sans leading-none">
                {formatPrice(product.price)}
              </span>
              {product.originalPrice && (
                <span className="text-xs md:text-sm text-text-muted/65 line-through font-sans">
                  {formatPrice(product.originalPrice)}
                </span>
              )}
              {discountRate > 0 && (
                <span className="text-xs font-semibold text-brand-gold bg-white px-2 py-0.5 rounded shadow-xs">
                  Tiết kiệm {formatPrice(product.originalPrice! - product.price)} ({discountRate}%)
                </span>
              )}
            </div>

            {/* Short outline summary desc */}
            <p className="text-xs md:text-sm text-text-charcoal/85 leading-relaxed font-light">
              {product.shortDescription}
            </p>

            {/* Value Pros checklists */}
            <div className="grid grid-cols-2 gap-3 p-3.5 bg-zinc-50 rounded-xl border border-zinc-150 text-[11px] text-text-muted font-sans font-light">
              <div className="flex items-center space-x-2">
                <Truck className="w-4 h-4 text-brand-purple shrink-0" />
                <span>Giao hàng hộp gỗ gia cố</span>
              </div>
              <div className="flex items-center space-x-2">
                <RefreshCw className="w-4 h-4 text-brand-purple shrink-0" />
                <span>Đền bù bể vỡ vận chuyển</span>
              </div>
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-brand-purple shrink-0" />
                <span>Bàn thêu tay thủ công mộc</span>
              </div>
              <div className="flex items-center space-x-2">
                <Heart className="w-4 h-4 text-brand-purple shrink-0" />
                <span>Thiệp tay gửi lời nhắn gửi</span>
              </div>
            </div>

          </div>

          {/* COUNTERS AND ACTIONS HUB */}
          <div className="mt-8 pt-6 border-t border-zinc-200/50 space-y-4">
            
            <div className="flex items-center gap-4">
              
              {/* Increase/decrease quant. numbers */}
              <div className="flex items-center border border-zinc-300 rounded-lg overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => handleQtyChange(qty - 1)}
                  className="px-4 py-2 hover:bg-zinc-100 active:bg-zinc-250 cursor-pointer font-bold text-sm"
                  id="desc-qty-item"
                >
                  -
                </button>
                <span className="px-4 text-xs font-semibold w-10 text-center">{qty}</span>
                <button
                  type="button"
                  onClick={() => handleQtyChange(qty + 1)}
                  className="px-4 py-2 hover:bg-zinc-100 active:bg-zinc-250 cursor-pointer font-bold text-sm"
                  id="inc-qty-item"
                >
                  +
                </button>
              </div>

              {/* Add Cart */}
              <button
                onClick={() => addToCart(product, qty)}
                disabled={product.stock <= 0}
                className="flex-1 bg-[#866881] hover:bg-brand-purple disabled:bg-zinc-350 text-white font-sans text-xs uppercase tracking-wider font-semibold py-3 px-4 rounded-lg flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-sm active:scale-98"
                id="addcart-detail-btn"
              >
                <ShoppingBag className="w-4 h-4 shrink-0" />
                <span>Thêm bọc giỏ hàng</span>
              </button>

              {/* Wishlist toggle */}
              <button
                onClick={() => toggleWishlist(product.id)}
                className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                  isFavorited
                    ? 'border-red-100 bg-red-50 text-red-500 hover:bg-red-100 scale-103'
                    : 'border-zinc-300 text-text-charcoal hover:bg-zinc-50'
                }`}
                id="wishlist-detail-btn"
              >
                <Heart className={`w-5 h-5 shrink-0 ${isFavorited ? 'fill-current' : ''}`} />
              </button>

            </div>

            {/* Mua Ngay launcher */}
            <button
              onClick={handleBuyNow}
              disabled={product.stock <= 0}
              className="w-full bg-[#1C1715] hover:bg-black text-amber-50 rounded-lg py-3 text-xs uppercase font-bold tracking-widest text-center cursor-pointer transition-all shadow active:scale-98"
              id="buynow-detail-btn"
            >
              Đặt quà mua ngay liền
            </button>

            {/* Interactive Accordion Sheets */}
            <div className="border border-zinc-200 rounded-xl overflow-hidden mt-6 bg-white shrink-0">
              {/* Acc 1: Description */}
              <div className="border-b border-zinc-100">
                <button
                  onClick={() => toggleAccordion('mota')}
                  className="w-full p-3 text-left text-xs font-semibold text-text-charcoal flex justify-between items-center hover:bg-zinc-50 cursor-pointer"
                  id="accordion-trigger-mota"
                >
                  <span>Mổ tả chiếc quà chi tiết</span>
                  <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${activeAccordion === 'mota' ? 'rotate-180' : ''}`} />
                </button>
                {activeAccordion === 'mota' && (
                  <div className="p-4 bg-[#FAF8F5] text-xs text-text-muted leading-relaxed font-light border-t border-zinc-100 font-sans whitespace-pre-line">
                    {product.fullDescription}
                  </div>
                )}
              </div>

              {/* Acc 2: Materials */}
              <div className="border-b border-zinc-100">
                <button
                  onClick={() => toggleAccordion('chatlieu')}
                  className="w-full p-3 text-left text-xs font-semibold text-text-charcoal flex justify-between items-center hover:bg-zinc-50 cursor-pointer"
                  id="accordion-trigger-chatlieu"
                >
                  <span>Chất liệu / Thành phần chế tác</span>
                  <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${activeAccordion === 'chatlieu' ? 'rotate-180' : ''}`} />
                </button>
                {activeAccordion === 'chatlieu' && (
                  <div className="p-4 bg-[#FAF8F5] text-xs text-text-muted leading-relaxed font-light border-t border-zinc-100 font-sans">
                    {product.materialsOrIngredients}
                  </div>
                )}
              </div>

              {/* Acc 3: Care info */}
              <div className="border-b border-zinc-100">
                <button
                  onClick={() => toggleAccordion('baoquan')}
                  className="w-full p-3 text-left text-xs font-semibold text-text-charcoal flex justify-between items-center hover:bg-zinc-50 cursor-pointer"
                  id="accordion-trigger-baoquan"
                >
                  <span>Hướng dẫn gìn giữ & Bảo quản</span>
                  <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${activeAccordion === 'baoquan' ? 'rotate-180' : ''}`} />
                </button>
                {activeAccordion === 'baoquan' && (
                  <div className="p-4 bg-[#FAF8F5] text-xs text-text-muted leading-relaxed font-light border-t border-zinc-100 font-sans">
                    {product.careInstructions}
                  </div>
                )}
              </div>

              {/* Acc 4: Delivery */}
              <div>
                <button
                  onClick={() => toggleAccordion('giao-doi')}
                  className="w-full p-3 text-left text-xs font-semibold text-text-charcoal flex justify-between items-center hover:bg-zinc-50 cursor-pointer"
                  id="accordion-trigger-giao-doi"
                >
                  <span>Chính sách vận chuyển & Đổi trả Huế</span>
                  <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${activeAccordion === 'giao-doi' ? 'rotate-180' : ''}`} />
                </button>
                {activeAccordion === 'giao-doi' && (
                  <div className="p-4 bg-[#FAF8F5] text-xs text-text-muted leading-relaxed font-light border-t border-zinc-100 font-sans space-y-1.5">
                    <p>• <b>Vận chuyển:</b> Miễn phí hoàn toán ship toàn nước cho hóa đơn từ 500.000 ₫. Với các hóa đơn nhỏ hơn, ship tiêu chuẩn 30.000 ₫ hoặc ship nhanh hỏa tốc 45.000 ₫.</p>
                    <p>• <b>Đổi trả:</b> Huegifts bồi thường hoàn đổi 100% không mất phí sản phẩm gốm mộc, trà hay tranh ảnh hư hao nứt vỡ trong lúc gửi bưu phẩm tới nhà lữ chủ.</p>
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* 3. CÂU CHUYỆN PHÍA SAU MÓN QUÀ (EDITORIAL MINI-COLUMN) */}
      <section className="bg-brand-gold-light/40 border border-brand-gold/15 rounded-3xl p-8 md:p-12 mb-16 relative overflow-hidden font-sans">
        {/* Subtle background flowers symbols decorative */}
        <div className="absolute top-4 right-4 text-brand-gold/10 font-serif text-8xl font-black select-none pointer-events-none">
          ❀
        </div>

        <div className="max-w-3xl mx-auto text-center">
          <span className="text-brand-gold text-[10px] tracking-widest uppercase font-bold bg-white px-3 py-1 rounded-full shadow-xs mb-4 inline-block">
            ❀ Câu chuyện phía sau món quà xứ Huế
          </span>
          <h2 className="text-2xl md:text-3xl font-serif font-medium text-text-charcoal tracking-tight leading-snug mb-6">
            Món quà nhỏ mang theo một hành trình văn hóa mộc mạc
          </h2>
          
          {/* Editorial contents */}
          <div className="text-xs md:text-sm text-text-charcoal/90 leading-relaxed font-serif italic mb-8 space-y-4 max-w-2xl mx-auto">
            <p className="leading-relaxed whitespace-pre-line text-[#5C4D44] font-light">
              "{product.story}"
            </p>
          </div>

          {/* Divider line design */}
          <div className="w-16 h-0.5 bg-brand-gold/60 mx-auto my-6" />

          <p className="text-[11px] text-text-muted leading-relaxed font-light font-sans max-w-lg mx-auto">
            Mỗi bưu vật tại Huegifts được trực tiếp người thợ đan, nghệ nhân gốm nung lửa và dột mướt lá gồi tại ngoại thành cố đô. Bạn trao mến cũng chính là đồng hành nâng bước làn nghề cổ kính dào dạt được gìn giữ ngọn lửa xưa.
          </p>
        </div>
      </section>

      {/* 4. UP-SELL RECOMMENDATIONS ("THƯỜNG ĐƯỢC MUA CÙNG") */}
      <section className="border border-brand-purple/10 bg-brand-purple-light/20 rounded-2xl p-6 mb-16 font-sans">
        <h4 className="text-xs font-bold text-brand-purple uppercase tracking-widest mb-4 flex items-center gap-1.5">
          <Heart className="w-4 h-4 text-brand-purple shrink-0 fill-brand-purple/20" />
          <span>Thường được bạn hữu chọn mua chung thành cặp</span>
        </h4>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center space-x-4">
            <img
              src={companionProduct.images[0]}
              alt={companionProduct.name}
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-xl object-cover shrink-0 shadow-sm border border-zinc-200"
            />
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wider">{companionProduct.categoryName}</p>
              <h5 className="text-xs font-serif font-semibold text-text-charcoal">{companionProduct.name}</h5>
              <span className="text-xs font-bold text-brand-purple">{formatPrice(companionProduct.price)}</span>
            </div>
          </div>

          <div className="flex items-center space-x-3.5">
            <button
              onClick={() => navigateTo('product', { slug: companionProduct.slug })}
              className="text-xs font-semibold text-text-charcoal hover:text-brand-purple transition-all cursor-pointer underline hover:no-underline"
              id="upsell-view-detail"
            >
              Ghé ngắm chuyện
            </button>
            <button
              onClick={() => addToCart(companionProduct, 1)}
              className="bg-brand-purple hover:bg-brand-purple/95 text-white py-2 px-4 rounded text-xs font-semibold cursor-pointer shadow-xs whitespace-nowrap"
              id="upsell-add-cart"
            >
              Gom mua cặp (+{formatPrice(companionProduct.price)})
            </button>
          </div>
        </div>
      </section>

      {/* 5. CUSTOMER FEEDBACK REVIEWS LIST */}
      <section className="border-t border-zinc-200 pt-12 mb-16">
        <h3 className="font-serif font-medium text-xl text-text-charcoal tracking-tight mb-6 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-[#B88A55] shrink-0" />
          <span>Lữ chủ bưu phẩm hồi tâm nhắn ghi lại</span>
        </h3>

        {/* Điểm trung bình gọn + tab lọc theo sao */}
        {summary.count > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl font-serif font-bold text-brand-purple leading-none">{summary.average.toFixed(1)}</span>
            <StarRating value={summary.average} readOnly size={16} />
            <span className="text-[11px] text-text-muted">({summary.count} đánh giá)</span>
          </div>
        )}

        {/* Tab nhóm theo sao — cuộn ngang được trên mobile */}
        <div className="flex items-center gap-2 mb-5 overflow-x-auto scrollbar-thin pb-1">
          {[
            { key: 0, label: `Tất cả (${summary.count})` },
            ...[5, 4, 3, 2, 1].map((s) => ({ key: s, label: `${s} ❀ (${summary.distribution?.[s] || 0})` })),
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStarFilter(tab.key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors cursor-pointer border ${
                starFilter === tab.key
                  ? 'bg-brand-purple text-white border-brand-purple'
                  : 'bg-white text-text-muted border-zinc-200 hover:border-brand-purple/40'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Danh sách đánh giá — trượt ngang để xem thêm */}
        {reviews.length === 0 ? (
          <p className="text-xs text-text-muted text-center py-6 italic">Chưa có đánh giá nào. Hãy là người đầu tiên chia sẻ cảm nhận về món quà này ạ! ❀</p>
        ) : filteredReviews.length === 0 ? (
          <p className="text-xs text-text-muted text-center py-6 italic">Chưa có đánh giá {starFilter} sao nào ạ.</p>
        ) : (
          <div className="flex gap-4 overflow-x-auto snap-x scrollbar-thin pb-3 -mx-1 px-1">
            {filteredReviews.map((rev) => (
              <div key={rev.id} className="snap-start shrink-0 w-[280px] sm:w-[320px] bg-[#FAF8F5] p-5 rounded-xl border border-zinc-150/50 flex flex-col">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-full bg-brand-gold-light text-[#B88A55] flex items-center justify-center font-bold text-xs shrink-0 font-serif uppercase">
                    {(rev.authorName || 'H').charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h5 className="text-xs font-semibold text-text-charcoal flex items-center gap-1.5 truncate">
                      {rev.authorName}
                      {rev.verifiedPurchase && (
                        <span className="text-[9px] bg-brand-green/10 text-brand-green px-1.5 py-0.5 rounded font-semibold normal-case shrink-0">✓ Đã mua</span>
                      )}
                    </h5>
                    <div className="flex items-center gap-2 mt-0.5">
                      <StarRating value={rev.rating} readOnly size={11} />
                      <span className="text-[10px] text-text-muted">{formatReviewDate(rev.createdAt)}</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-text-charcoal/85 leading-relaxed font-light line-clamp-4">
                  {rev.message}
                </p>

                {rev.sellerReply && (
                  <div className="mt-3 bg-brand-purple/5 border-l-2 border-brand-purple/40 rounded-r-lg p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-brand-purple mb-1">❀ Phản hồi từ Huegifts</p>
                    <p className="text-[11px] text-text-charcoal/80 leading-relaxed line-clamp-3">{rev.sellerReply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 6. RELATED PRODUCTS GRIDS BY CATEGORIES */}
      {relatedProducts.length > 0 && (
        <section className="border-t border-zinc-200 pt-12">
          <h3 className="font-serif font-medium text-xl text-text-charcoal tracking-tight mb-8">
            Những sản phẩm liên quan kỳ cùng
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {relatedProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

    </div>
  );
};
