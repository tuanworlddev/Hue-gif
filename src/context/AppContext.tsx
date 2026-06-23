import React, { createContext, useContext, useState, useEffect } from 'react';
import { Product, CartItem, Order, Story, PublicUserAccount } from '../types';
import { PRODUCTS } from '../data/products';
import { STORIES } from '../data/stories';

interface UserProfile {
  fullName: string;
  email: string;
  phone: string;
  province: string;
  district: string;
  ward: string;
  addressDetail: string;
}

interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'info' | 'error';
}

interface AppContextType {
  page: string;
  routeParams: any;
  cart: CartItem[];
  wishlist: string[];
  recentlyViewed: string[];
  orders: Order[];
  user: PublicUserAccount | null;
  stories: Story[];
  toasts: ToastMessage[];
  discountCode: string;
  discountPercentage: number;
  quickViewProduct: Product | null;
  products: Product[];
  adminToken: string | null;
  navigateTo: (page: string, params?: any) => void;
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  toggleWishlist: (productId: string) => void;
  addToRecentlyViewed: (productId: string) => void;
  addOrder: (order: Order) => void;
  updateOrderStatusLocal: (orderId: string, status: 'confirmed' | 'pending_payment' | 'packing' | 'shipping' | 'delivered' | 'cancelled') => void;
  register: (payload: UserProfile & { password: string }) => Promise<boolean>;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateUserProfile: (payload: Partial<UserProfile> & { currentPassword?: string; newPassword?: string }) => Promise<boolean>;
  loginDemo: (user: UserProfile) => void;
  logoutDemo: () => void;
  addToast: (message: string, type?: 'success' | 'info' | 'error') => void;
  removeToast: (id: string) => void;
  applyDiscount: (code: string) => boolean;
  setQuickViewProduct: (product: Product | null) => void;
  adminLogin: (email: string) => Promise<boolean>;
  adminLogout: () => void;
  fetchProducts: () => Promise<void>;
  fetchStories: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Helper to parse current hash in browser to { page, params }
const parseHashRoute = () => {
  const hash = window.location.hash || '#/';
  const cleanHash = hash.replace(/^#/, '');

  if (cleanHash === '/' || cleanHash === '') {
    return { page: 'home', routeParams: {} };
  }

  // Check dynamic paths with slashes
  const parts = cleanHash.split('/').filter(Boolean); // e.g. ["product", "non-la-bai-tho"]

  if (parts[0] === 'admin') {
    if (parts[1] === 'login') {
      return { page: 'admin-login', routeParams: {} };
    }
    const token = sessionStorage.getItem('huegifts_admin_token');
    if (!token) {
      setTimeout(() => {
        window.location.hash = '#/admin/login';
      }, 0);
      return { page: 'admin-login', routeParams: {} };
    }
    return { page: 'admin-dashboard', routeParams: { tab: parts[1] || 'dashboard' } };
  }

  // Legacy / alternate admin hashes used across the app
  if (parts[0] === 'admin-login') {
    return { page: 'admin-login', routeParams: {} };
  }

  if (parts[0] === 'admin-dashboard') {
    const token = sessionStorage.getItem('huegifts_admin_token');
    if (!token) {
      setTimeout(() => {
        window.location.hash = '#/admin/login';
      }, 0);
      return { page: 'admin-login', routeParams: {} };
    }
    return { page: 'admin-dashboard', routeParams: {} };
  }

  if (parts[0] === 'product' && parts[1]) {
    return { page: 'product', routeParams: { slug: parts[1] } };
  }
  if (parts[0] === 'stories' && parts[1]) {
    return { page: 'story', routeParams: { slug: parts[1] } };
  }
  if (parts[0] === 'collections' && parts[1]) {
    return { page: 'collection', routeParams: { slug: parts[1] } };
  }
  if (parts[0] === 'order-success' && parts[1]) {
    return { page: 'order-success', routeParams: { orderId: parts[1] } };
  }

  // Static endpoints
  const pageMap: Record<string, string> = {
    'shop': 'shop',
    'stories': 'stories',
    'collections': 'collections',
    'wishlist': 'wishlist',
    'cart': 'cart',
    'checkout': 'checkout',
    'track-order': 'track-order',
    'profile': 'profile',
    'about': 'about',
    'contact': 'contact'
  };

  const key = parts[0];
  if (pageMap[key]) {
    return { page: pageMap[key], routeParams: {} };
  }

  return { page: 'home', routeParams: {} };
};

// Parse query string params to determine initial page (VNPay redirect, etc.)
function parseQueryRoute(): { page: string; routeParams: any } | null {
  const params = new URLSearchParams(window.location.search);
  const page = params.get('page');
  if (!page) return null;

  if (page === 'order-success') {
    const orderId = params.get('orderId') || '';
    const vnpay = params.get('vnpay');
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    return { page: 'order-success', routeParams: { orderId, fromVnpay: vnpay === 'success' } };
  }

  if (page === 'vnpay-result') {
    const orderId = params.get('orderId') || '';
    const status = params.get('status') || 'failed';
    const reason = params.get('reason') || 'Giao dịch không thành công';
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    return { page: 'vnpay-result', routeParams: { orderId, status, reason } };
  }

  return null;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryRoute = parseQueryRoute();
  const [routeState, setRouteState] = useState(queryRoute || parseHashRoute());
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [user, setUser] = useState<PublicUserAccount | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [discountCode, setDiscountCode] = useState<string>('');
  const [discountPercentage, setDiscountPercentage] = useState<number>(0);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [products, setProducts] = useState<Product[]>(PRODUCTS);
  const [stories, setStories] = useState<Story[]>(STORIES);
  const [adminToken, setAdminToken] = useState<string | null>(sessionStorage.getItem('huegifts_admin_token'));
  const [userToken, setUserToken] = useState<string | null>(sessionStorage.getItem('huegifts_user_token'));

  // Synchronize on load and when hash changes
  useEffect(() => {
    const handleHashChange = () => {
      setRouteState(parseHashRoute());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Hydrate states from localstorage
  useEffect(() => {
    try {
      const storedUserToken = localStorage.getItem('huegifts_user_token');
      if (storedUserToken) setUserToken(storedUserToken);

      const storedCart = localStorage.getItem('huegifts_cart');
      if (storedCart) setCart(JSON.parse(storedCart));

      const storedWishlist = localStorage.getItem('huegifts_wishlist');
      if (storedWishlist) setWishlist(JSON.parse(storedWishlist));

      const storedRecently = localStorage.getItem('huegifts_recently');
      if (storedRecently) setRecentlyViewed(JSON.parse(storedRecently));

      const storedOrders = localStorage.getItem('huegifts_orders');
      if (storedOrders) setOrders(JSON.parse(storedOrders));

      const storedUser = localStorage.getItem('huegifts_user');
      if (storedUser && !storedUserToken) {
        setUser(JSON.parse(storedUser));
      }
    } catch (e) {
      console.error("Error reading localStorage", e);
    }
  }, []);

  useEffect(() => {
    const hydrateAuthUser = async () => {
      if (!userToken) return;
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${userToken}` },
        });
        if (!res.ok) {
          localStorage.removeItem('huegifts_user_token');
          localStorage.removeItem('huegifts_user');
          setUserToken(null);
          setUser(null);
          return;
        }
        const data = await res.json();
        if (data?.user) {
          setUser(data.user);
          localStorage.setItem('huegifts_user', JSON.stringify(data.user));
        }
      } catch (err) {
        console.error('Failed to hydrate auth user', err);
      }
    };

    hydrateAuthUser();
  }, [userToken]);

  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/products");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setProducts(data);
        }
      }
    } catch (err) {
      console.error("Failed to fetch products from backend:", err);
    }
  };

  const fetchStories = async () => {
    try {
      const res = await fetch("/api/stories");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setStories(data);
        }
      }
    } catch (err) {
      console.error("Failed to fetch stories from backend:", err);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchStories();
  }, []);

  const adminLogin = async (email: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.sessionToken) {
          sessionStorage.setItem("huegifts_admin_token", data.sessionToken);
          setAdminToken(data.sessionToken);
          addToast("Xác thực quyền quản trị cố đô thành công!", "success");
          return true;
        }
      } else {
        const errorData = await res.json();
        addToast(errorData.error || "Lỗi đăng nhập admin.", "error");
      }
    } catch (err) {
      addToast("Không thể kết nối bưu cục quản trị.", "error");
    }
    return false;
  };

  const adminLogout = () => {
    sessionStorage.removeItem("huegifts_admin_token");
    setAdminToken(null);
    addToast("Đã rời khỏi phiên quản trị viên.", "info");
    navigateTo("home");
  };

  const persistUser = (nextUser: PublicUserAccount | null, token?: string | null) => {
    setUser(nextUser);
    if (nextUser) {
      localStorage.setItem('huegifts_user', JSON.stringify(nextUser));
    } else {
      localStorage.removeItem('huegifts_user');
    }
    if (token !== undefined) {
      setUserToken(token);
      if (token) {
        localStorage.setItem('huegifts_user_token', token);
      } else {
        localStorage.removeItem('huegifts_user_token');
      }
    }
  };

  // Sync to localstorage hooks
  const saveCart = (newCart: CartItem[]) => {
    setCart(newCart);
    localStorage.setItem('huegifts_cart', JSON.stringify(newCart));
  };

  const saveWishlist = (newWish: string[]) => {
    setWishlist(newWish);
    localStorage.setItem('huegifts_wishlist', JSON.stringify(newWish));
  };

  const saveOrders = (newOrders: Order[]) => {
    setOrders(newOrders);
    localStorage.setItem('huegifts_orders', JSON.stringify(newOrders));
  };

  const saveRecentlyViewed = (newRecents: string[]) => {
    setRecentlyViewed(newRecents);
    localStorage.setItem('huegifts_recently', JSON.stringify(newRecents));
  };

  // Toast systems
  const addToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), 2500);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Navigators
  const navigateTo = (targetPage: string, params?: any) => {
    let hash = '#/';
    if (targetPage === 'home') {
      hash = '#/';
    } else if (targetPage === 'product' && params?.slug) {
      hash = `#/product/${params.slug}`;
    } else if (targetPage === 'story' && params?.slug) {
      hash = `#/stories/${params.slug}`;
    } else if (targetPage === 'collection' && params?.slug) {
      hash = `#/collections/${params.slug}`;
    } else if (targetPage === 'order-success' && params?.orderId) {
      hash = `#/order-success/${params.orderId}`;
    } else {
      hash = `#/${targetPage}`;
    }
    window.location.hash = hash;
  };

  // Cart operations
  const addToCart = (product: Product, quantity: number = 1) => {
    const index = cart.findIndex(item => item.product.id === product.id);
    let updated: CartItem[];
    if (index >= 0) {
      updated = [...cart];
      updated[index].quantity += quantity;
    } else {
      updated = [...cart, { product, quantity }];
    }
    saveCart(updated);
    addToast(`Đã thêm "${product.name}" vào giỏ hàng`, 'success');
  };

  const removeFromCart = (productId: string) => {
    const item = cart.find(i => i.product.id === productId);
    const updated = cart.filter(i => i.product.id !== productId);
    saveCart(updated);
    if (item) {
      addToast(`Đã bỏ "${item.product.name}" khỏi giỏ hàng`, 'info');
    }
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    const updated = cart.map(item => {
      if (item.product.id === productId) {
        return { ...item, quantity };
      }
      return item;
    });
    saveCart(updated);
  };

  const clearCart = () => {
    saveCart([]);
  };

  // Wishlist mechanisms
  const toggleWishlist = (productId: string) => {
    const p = PRODUCTS.find(prod => prod.id === productId);
    if (!p) return;

    let updated: string[];
    if (wishlist.includes(productId)) {
      updated = wishlist.filter(id => id !== productId);
      addToast(`Đã bỏ "${p.name}" khỏi mục yêu thích`, 'info');
    } else {
      updated = [...wishlist, productId];
      addToast(`Đã lưu "${p.name}" vào mục yêu thích`, 'success');
    }
    saveWishlist(updated);
  };

  // Recently Viewed tracker
  const addToRecentlyViewed = (productId: string) => {
    const filtered = recentlyViewed.filter(id => id !== productId);
    const updated = [productId, ...filtered].slice(0, 6);
    saveRecentlyViewed(updated);
  };

  // Order systems
  const addOrder = (order: Order) => {
    const updated = [order, ...orders];
    saveOrders(updated);
  };

  const updateOrderStatusLocal = (orderId: string, status: 'confirmed' | 'pending_payment' | 'packing' | 'shipping' | 'delivered' | 'cancelled') => {
    const updated = orders.map(o => o.id === orderId ? { ...o, status } : o);
    saveOrders(updated);
  };

  // Authentication simulations
  const register = async (payload: UserProfile & { password: string }) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || 'Không thể đăng ký tài khoản.', 'error');
        return false;
      }
      persistUser(data.user, data.token);
      addToast(`Đã tạo tài khoản cho ${data.user.fullName}.`, 'success');
      return true;
    } catch (err) {
      addToast('Không thể kết nối máy chủ đăng ký.', 'error');
      return false;
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || 'Đăng nhập thất bại.', 'error');
        return false;
      }
      persistUser(data.user, data.token);
      addToast(`Xin chào, ${data.user.fullName}!`, 'success');
      return true;
    } catch (err) {
      addToast('Không thể kết nối máy chủ đăng nhập.', 'error');
      return false;
    }
  };

  const logout = async () => {
    try {
      if (userToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${userToken}` },
        });
      }
    } catch {
      // ignore network errors on logout
    }
    persistUser(null, null);
    addToast('Đã đăng xuất tài khoản.', 'info');
  };

  const updateUserProfile = async (payload: Partial<UserProfile> & { currentPassword?: string; newPassword?: string }) => {
    try {
      if (!userToken) {
        addToast('Bạn cần đăng nhập để cập nhật hồ sơ.', 'error');
        return false;
      }
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || 'Lỗi cập nhật hồ sơ.', 'error');
        return false;
      }
      persistUser(data.user, userToken);
      addToast('Đã cập nhật hồ sơ người dùng.', 'success');
      return true;
    } catch (err) {
      addToast('Không thể kết nối máy chủ cập nhật hồ sơ.', 'error');
      return false;
    }
  };

  const loginDemo = (profile: UserProfile) => {
    const demoUser: PublicUserAccount = {
      id: 'demo-user',
      name: profile.fullName,
      fullName: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      province: profile.province,
      district: profile.district,
      ward: profile.ward,
      addressDetail: profile.addressDetail,
      role: 'user',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    persistUser(demoUser, null);
    addToast(`Đăng nhập thành công! Chào bạn, ${demoUser.fullName}`, 'success');
  };

  const logoutDemo = () => {
    persistUser(null, null);
    addToast("Đã đăng xuất tài khoản", "info");
  };

  // Discount Codes
  const applyDiscount = (code: string) => {
    if (code.trim().toUpperCase() === 'HUEGIFTS10') {
      setDiscountCode('HUEGIFTS10');
      setDiscountPercentage(10);
      addToast("Đã áp dụng mã giảm giá HUEGIFTS10 (Giảm 10%)", "success");
      return true;
    }
    addToast("Mã giảm giá không chính xác hoặc đã hết hạn", "error");
    return false;
  };

  return (
    <AppContext.Provider value={{
      page: routeState.page,
      routeParams: routeState.routeParams,
      cart,
      wishlist,
      recentlyViewed,
      orders,
      user,
      stories,
      toasts,
      discountCode,
      discountPercentage,
      quickViewProduct,
      products,
      adminToken,
      navigateTo,
      addToCart,
      removeFromCart,
      updateCartQuantity,
      clearCart,
      toggleWishlist,
      addToRecentlyViewed,
      addOrder,
      updateOrderStatusLocal,
      register,
      login,
      logout,
      updateUserProfile,
      loginDemo,
      logoutDemo,
      addToast,
      removeToast,
      applyDiscount,
      setQuickViewProduct,
      adminLogin,
      adminLogout,
      fetchProducts,
      fetchStories
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside an AppProvider');
  return context;
};
