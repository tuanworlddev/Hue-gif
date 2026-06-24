import React, { useEffect, useState } from 'react';
import { User, LogIn, Key, Mail, Phone, MapPin, Box, Landmark, Eye, LogOut, CheckCircle, Save, Star } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PRODUCTS } from '../data/products';
import { ProductCard } from '../components/ProductCard';
import { Breadcrumb } from '../components/Breadcrumb';

export const Account: React.FC = () => {
  const { user, login, logout, register, updateUserProfile, orders, recentlyViewed, navigateTo, addToast, loginDemo } = useApp();

  // Auth local states
  const [isRegister, setIsRegister] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userWard, setUserWard] = useState('Vỹ Dạ');
  const [userAddress, setUserAddress] = useState('');

  // Profile edit states
  const [editName, setEditName] = useState(user?.fullName || user?.name || '');
  const [editPhone, setEditPhone] = useState(user?.phone || '');
  const [editEmail, setEditEmail] = useState(user?.email || '');
  const [editProvince, setEditProvince] = useState(user?.province || 'Thừa Thiên Huế');
  const [editDistrict, setEditDistrict] = useState(user?.district || 'Thành phố Huế');
  const [editWard, setEditWard] = useState(user?.ward || '');
  const [editAddress, setEditAddress] = useState(user?.addressDetail || '');

  useEffect(() => {
    setEditName(user?.fullName || user?.name || '');
    setEditPhone(user?.phone || '');
    setEditEmail(user?.email || '');
    setEditProvince(user?.province || 'Thừa Thiên Huế');
    setEditDistrict(user?.district || 'Thành phố Huế');
    setEditWard(user?.ward || '');
    setEditAddress(user?.addressDetail || '');
  }, [user]);

  const formatPrice = (value: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegister) {
      if (!userName.trim() || !userEmail.trim() || !userPassword.trim() || !userPhone.trim() || !userWard.trim() || !userAddress.trim()) {
        addToast('Vui lòng điền đủ thông tin đăng ký.', 'error');
        return;
      }

      await register({
        fullName: userName.trim(),
        email: userEmail.trim(),
        password: userPassword,
        phone: userPhone.trim(),
        province: 'Thừa Thiên Huế',
        district: 'Thành phố Huế',
        ward: userWard.trim(),
        addressDetail: userAddress.trim(),
      });
      return;
    }

    if (!userEmail.trim() || !userPassword.trim()) {
      addToast('Vui lòng nhập email và mật khẩu.', 'error');
      return;
    }

    await login(userEmail.trim(), userPassword);
  };

  const handleQuickDemoLogin = () => {
    const backupDemo = {
      fullName: "Tôn Nữ Hạo Nhiên",
      email: "tonnu.haonhien@hue.vn",
      phone: "0905111222",
      province: "Thừa Thiên Huế",
      district: "Thành phố Huế",
      ward: "Vỹ Dạ",
      addressDetail: "12 Vỹ Dạ Trăng Vỹ"
    };
    loginDemo(backupDemo);
    
    // prefill states edit fields
    setEditName(backupDemo.fullName);
    setEditPhone(backupDemo.phone);
    setEditEmail(backupDemo.email);
    setEditWard(backupDemo.ward);
    setEditAddress(backupDemo.addressDetail);
    
    addToast("Chào đón Tôn Nữ ghé thăm !", "success");
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      addToast("Tên người nhận không được để trống.", "error");
      return;
    }
    updateUserProfile({
      fullName: editName,
      phone: editPhone,
      email: editEmail,
      province: editProvince,
      district: editDistrict,
      ward: editWard,
      addressDetail: editAddress
    });
    addToast("Đã lưu  thông tin vận chuyển thành công!", "success");
  };

  // Recently viewed items list
  const recentProductsList = PRODUCTS.filter(p => recentlyViewed.includes(p.id));

  // User's order list
  const userOrders = user
    ? orders.filter((ord) => {
        const emailMatch = user.email && ord.email && ord.email.trim().toLowerCase() === user.email.trim().toLowerCase();
        const phoneMatch = user.phone && ord.phone && ord.phone.trim() === user.phone.trim();
        return emailMatch || phoneMatch;
      })
    : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 pb-16 font-sans">
      
      {/* Breadcrumb */}
      <Breadcrumb items={[{ label: 'Tài khoản Khách Hàng' }]} />

      {/* GATE 1: IF NOT AUTHORIZED */}
      {!user ? (
        <section className="max-w-lg mx-auto my-10 bg-white border border-zinc-200 rounded-3xl p-8 shadow-md font-sans space-y-6">
          <div className="text-center space-y-2">
            <User className="w-12 h-12 text-[#B88A55] mx-auto mb-1 shrink-0 bg-brand-gold-light/50 p-2.5 rounded-full" />
            <h2 className="text-2xl font-serif font-semibold text-text-charcoal tracking-tight">
              {isRegister ? 'Tạo tài khoản Huegifts' : 'Đăng nhập tài khoản Huegifts'}
            </h2>
            <p className="text-xs text-text-muted leading-relaxed font-light font-sans max-w-xs mx-auto">
              {isRegister
                ? 'Tạo tài khoản để lưu hồ sơ giao nhận, theo dõi đơn hàng và quản lý quà tặng Huế nhanh hơn.'
                : 'Đăng nhập để xem hồ sơ, đơn hàng và giỏ quà đã lưu.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 bg-zinc-100 p-1 rounded-xl">
            <button type="button" onClick={() => setIsRegister(false)} className={`py-2 rounded-lg text-xs font-bold uppercase tracking-wider ${!isRegister ? 'bg-white text-brand-purple shadow-sm' : 'text-zinc-500'}`}>
              Đăng nhập
            </button>
            <button type="button" onClick={() => setIsRegister(true)} className={`py-2 rounded-lg text-xs font-bold uppercase tracking-wider ${isRegister ? 'bg-white text-brand-purple shadow-sm' : 'text-zinc-500'}`}>
              Đăng ký
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {isRegister && (
              <>
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-wider text-text-charcoal block mb-1">Họ tên</label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 pl-9 text-xs focus:ring-1 focus:ring-brand-purple focus:bg-white focus:outline-none"
                      placeholder="Ví dụ: Nguyễn Văn A"
                    />
                    <User className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold tracking-wider text-text-charcoal block mb-1">Số điện thoại</label>
                  <div className="relative">
                    <input
                      type="tel"
                      required
                      value={userPhone}
                      onChange={(e) => setUserPhone(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 pl-9 text-xs focus:ring-1 focus:ring-brand-purple focus:bg-white focus:outline-none"
                      placeholder="0977047908"
                    />
                    <Phone className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider text-text-charcoal block mb-1">Email *</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  placeholder="guithongdiep.hue@gmail.com"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 pl-9 text-xs focus:ring-1 focus:ring-brand-purple focus:bg-white focus:outline-none"
                  id="auth-email-field"
                />
                <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider text-text-charcoal block mb-1">Mật khẩu *</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  placeholder="Nhập mật khẩu"
                  value={userPassword}
                  onChange={(e) => setUserPassword(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 pl-9 text-xs focus:ring-1 focus:ring-brand-purple focus:bg-white focus:outline-none"
                  id="auth-password-field"
                />
                <Key className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>

            {isRegister && (
              <>
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-wider text-text-charcoal block mb-1">Phường / Xã</label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={userWard}
                      onChange={(e) => setUserWard(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 pl-9 text-xs focus:ring-1 focus:ring-brand-purple focus:bg-white focus:outline-none"
                      placeholder="Vỹ Dạ"
                    />
                    <MapPin className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold tracking-wider text-text-charcoal block mb-1">Địa chỉ cụ thể</label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={userAddress}
                      onChange={(e) => setUserAddress(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 pl-9 text-xs focus:ring-1 focus:ring-brand-purple focus:bg-white focus:outline-none"
                      placeholder="67 Phan Đình Phùng"
                    />
                    <Landmark className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              className="w-full bg-brand-purple hover:bg-brand-purple/95 text-white py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest text-center cursor-pointer transition-colors flex items-center justify-center space-x-1.5 shadow"
              id="auth-login-submit-btn"
            >
              <LogIn className="w-4 h-4 shrink-0" />
              <span>{isRegister ? 'Tạo tài khoản' : 'Đăng nhập'}</span>
            </button>
          </form>

          {/* Quick interactive demologin action shortcut */}
          <div className="border-t border-zinc-150 pt-4 text-center space-y-3">
            <p className="text-[10px] text-text-muted font-sans font-light">
              Hoặc dùng nhanh tài khoản  sẵn của Huegifts để thử nghiệm tức khắc:
            </p>
            <button
              onClick={handleQuickDemoLogin}
              className="bg-brand-gold-light hover:bg-brand-gold-light/95 border border-brand-gold/15 text-[#5C452F] py-2 px-4 rounded-lg text-[11px] font-sans font-bold flex items-center space-x-1.5 mx-auto cursor-pointer"
              id="auth-quick-demologin"
            >
              <Star className="w-3.5 h-3.5 text-brand-gold fill-current" />
              <span>Đăng nhập demo "Tôn Nữ Hạo Nhiên"</span>
            </button>
          </div>

        </section>
      ) : (
        
        /* GATE 2: USER PROFILE INTERFACES */
        <div className="space-y-12">
          
          {/* Header profiles */}
          <div className="border-b border-zinc-300 pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-serif font-semibold text-text-charcoal leading-none">
                Xin chào quý khách, <span className="text-brand-purple italic">{user.fullName || user.name}</span>
              </h2>
              <p className="text-xs text-text-muted mt-1 leading-relaxed font-light">
                Ghé thăm cửa hàng Huegifts. Thảnh thơi điều chỉnh thông tin gửi bưu hoặc ngắm lại dấu chân hành tinh xưa.
              </p>
            </div>

            <button
              onClick={logout}
              className="border border-red-500 hover:bg-red-50 text-red-500 rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wider flex items-center space-x-1.5 cursor-pointer self-start md:self-auto"
              id="logout-main-btn"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Đăng xuất</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* 1. EDIT DEFAULT DISPATCH ADDRESS DETAILS (R.Col 7/12) */}
            <div className="lg:col-span-7 bg-white border border-zinc-200 p-6 rounded-2xl shadow-xs space-y-5">
              <h3 className="text-xs font-bold uppercase text-brand-purple tracking-widest flex items-center gap-1.5 border-b border-zinc-100 pb-3">
                <MapPin className="w-4 h-4 text-brand-purple shrink-0" />
                <span> Địa chỉ nhận bưu phẩm mặc định</span>
              </h3>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold tracking-wider text-text-charcoal mb-1 block">Tên người thưa nhận</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-brand-purple focus:bg-white focus:outline-none"
                      id="profile-name-field"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold tracking-wider text-text-charcoal mb-1 block">Số điện thoại liên lạc</label>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-brand-purple focus:bg-white focus:outline-none"
                      id="profile-phone-field"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold tracking-wider text-text-charcoal mb-1 block">Địa chỉ hòm thư Email</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-brand-purple focus:bg-white focus:outline-none"
                    id="profile-email-field"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold tracking-wider text-text-charcoal mb-1 block">Tỉnh thành</label>
                    <input
                      type="text"
                      value={editProvince}
                      onChange={(e) => setEditProvince(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs text-text-muted focus:outline-none cursor-not-allowed bg-zinc-150"
                      disabled
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold tracking-wider text-text-charcoal mb-1 block">Quận / Huyện</label>
                    <input
                      type="text"
                      value={editDistrict}
                      onChange={(e) => setEditDistrict(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs text-text-charcoal focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold tracking-wider text-text-charcoal mb-1 block">Phường / Xã</label>
                    <input
                      type="text"
                      value={editWard}
                      placeholder="Ví dụ: Vỹ Dạ"
                      onChange={(e) => setEditWard(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-brand-purple focus:bg-white focus:outline-none"
                      id="profile-ward-field"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold tracking-wider text-text-charcoal mb-1 block">Địa số nhà, Số ngõ cụ thể</label>
                  <input
                    type="text"
                    value={editAddress}
                    placeholder="Ví dụ: Ngách 4/12 kiệt thôn Vỹ Dạ"
                    onChange={(e) => setEditAddress(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-brand-purple focus:bg-white focus:outline-none"
                    id="profile-addressdetail-field"
                  />
                </div>

                <button
                  type="submit"
                  className="bg-brand-purple hover:bg-brand-purple/95 text-white py-2 px-6 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5 cursor-pointer shadow-xs"
                  id="profile-save-submit-btn"
                >
                  <Save className="w-4 h-4 shrink-0" />
                  <span>Cập nhật thông tin</span>
                </button>
              </form>
            </div>

            {/* 2. PLACED ORDERS TIMELINE DRAWER FOR USER RECORD (R.Col 5/12) */}
            <div className="lg:col-span-12 xl:col-span-5 bg-white border border-zinc-250 p-6 rounded-2xl shadow-sm space-y-5 font-sans">
              <h3 className="text-xs font-bold uppercase text-brand-purple tracking-widest flex items-center gap-1.5 border-b border-zinc-100 pb-3">
                <Box className="w-4 h-4 text-brand-purple shrink-0" />
                <span> Hóa đơn đã ghi nhận</span>
              </h3>

              {userOrders.length > 0 ? (
                <div className="space-y-4">
                  {userOrders.map((ord) => (
                    <div
                      key={ord.id}
                      className="bg-[#FAF8F5] border border-zinc-150 p-4 rounded-xl space-y-3 font-sans"
                      id={`order-log-${ord.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-text-charcoal bg-white border px-2 py-0.5 rounded shadow-xs">{ord.id}</span>
                        <span className="text-[10px] text-brand-gold font-semibold uppercase tracking-wider">
                          ❀ {ord.status === 'confirmed' ? 'Đang chuẩn bị' : 'Đang di chuyển'}
                        </span>
                      </div>

                      <div className="text-[11px] text-text-muted space-y-1">
                        <p>• Ngày gửi: {new Date(ord.createdAt).toLocaleDateString('vi-VN')}</p>
                        <p>• Trị giá sớ quà: <span className="font-semibold text-[#6E4B67]">{formatPrice(ord.total)}</span></p>
                        <p className="truncate">• Gửi ngỏ: {ord.addressDetail}, {ord.ward}</p>
                      </div>

                      <div className="pt-2 border-t border-zinc-100 flex gap-2">
                        <button
                          onClick={() => {
                            localStorage.setItem('huegifts_track_order_prefetch', JSON.stringify({ id: ord.id, phone: ord.phone }));
                            navigateTo('track-order');
                          }}
                          className="bg-brand-purple hover:bg-[#54344E] text-white py-1 px-3 rounded text-[10px] font-semibold cursor-pointer whitespace-nowrap uppercase tracking-wider"
                          id={`track-order-log-${ord.id}`}
                        >
                          Theo hành trình bưu
                        </button>
                      </div>

                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 font-sans bg-zinc-50 rounded-xl">
                  <Box className="w-8 h-8 text-zinc-400 mx-auto mb-2 opacity-50 shrink-0" />
                  <p className="text-xs text-text-muted font-light">Chưa có lịch sử ký dột hóa đơn bọc quà nào.</p>
                </div>
              )}
            </div>

          </div>

          {/* 3. RECENTLY VIEWED SHELF PRODUCTS */}
          {recentProductsList.length > 0 && (
            <section className="border-t border-zinc-200 pt-10">
              <h3 className="font-serif font-medium text-lg text-text-charcoal tracking-tight mb-6 flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-brand-purple shrink-0 animate-pulse" />
                <span>Những món quà mà quý khách đã xem qua </span>
              </h3>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                {recentProductsList.slice(0, 4).map(p => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </section>
          )}

        </div>
      )}

    </div>
  );
};
