import React from 'react';
import { AlertCircle, ArrowLeft, Landmark } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const NotFound: React.FC = () => {
  const { navigateTo } = useApp();

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 font-sans py-16">
      
      <div className="bg-[#FAF8F5] border border-zinc-200 p-8 md:p-12 rounded-3xl max-w-md text-center shadow-sm space-y-6">
        
        <AlertCircle className="w-16 h-16 text-brand-gold mx-auto shrink-0 animate-pulse bg-brand-gold-light/40 p-3.5 rounded-full" />
        
        <div className="space-y-2">
          <h2 className="font-serif font-semibold text-text-charcoal text-xl md:text-2xl tracking-tight leading-none">
            Huegifts...
          </h2>
          <p className="text-xs text-text-muted leading-relaxed font-light max-w-sm mx-auto font-sans">
            Chúng tôi kể câu chuyện về Huế qua những món quà nhỏ. Mỗi sản phẩm không chỉ đẹp và ý nghĩa mà còn mang theo một mảnh ký ức, một nét văn hóa, hay một câu chuyện đặc biệt của vùng đất cố đô. Mong rằng khi trao đi món quà ấy, bạn cũng đang trao đi một phần hồn Huế.
          </p>
        </div>

        {/* Divider line design */}
        <div className="w-12 h-0.5 bg-brand-gold/50 mx-auto" />

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => navigateTo('home')}
            className="w-full sm:w-auto bg-[#6E4B67] hover:bg-[#54344E] text-white text-xs font-semibold uppercase tracking-wider py-2.5 px-6 rounded-lg cursor-pointer transition-colors flex items-center justify-center space-x-1.5"
            id="notfound-back-home"
          >
            <Landmark className="w-4 h-4 shrink-0" />
            <span>Về Trang chủ </span>
          </button>
          
          <button
            onClick={() => navigateTo('shop')}
            className="w-full sm:w-auto bg-white hover:bg-zinc-100 text-text-charcoal border border-zinc-250 text-xs font-semibold tracking-wider py-2.5 px-6 rounded-lg cursor-pointer transition-all"
            id="notfound-back-shop"
          >
            Cửa hàng
          </button>
        </div>

      </div>

    </div>
  );
};
