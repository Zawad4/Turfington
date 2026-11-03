import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Heart, 
  Star, 
  X, 
  Check, 
  Award, 
  ArrowRight, 
  PlusCircle, 
  Grid, 
  Lock, 
  MessageSquare,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Upload,
  Camera,
  Image as ImageIcon,
  Trash2,
  Edit3
} from 'lucide-react';
import { 
  apiFetchMarketplaceItems, 
  apiSubscribeMarketplaceItems, 
  apiCreateMarketplaceItem, 
  apiUpdateMarketplaceItem, 
  apiDeleteMarketplaceItem,
  getInterconnectedAccounts,
  compressDataUrlOrFile
} from '../services/db';

export default function Marketplace({ 
  likedProducts = [], 
  setLikedProducts,
  user,
  setTab,
  onContactSeller
}) {
  const [activeSection, setActiveSection] = useState('browse'); // 'browse' or 'sell'
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Form states for Listing Gear
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState('Equipment');
  const [itemPrice, setItemPrice] = useState('');
  const [itemCondition, setItemCondition] = useState('New (Sealed Pack)');
  const [itemDesc, setItemDesc] = useState('');
  const [itemImage, setItemImage] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [listSuccess, setListSuccess] = useState(false);

  // Guidelines confirmation checkboxes
  const [confirmPhoto, setConfirmPhoto] = useState(false);
  const [confirmPrice, setConfirmPrice] = useState(false);

  // Edit / Delete Modal State
  const [editingProduct, setEditingProduct] = useState(null);
  const [deletingProduct, setDeletingProduct] = useState(null);

  // Edit Form State
  const [editForm, setEditForm] = useState({
    name: '',
    category: 'Equipment',
    price: '',
    condition: 'New (Sealed Pack)',
    description: '',
    image: ''
  });

  const [productsList, setProductsList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
    setIsLoading(true);
    const unsubscribe = apiSubscribeMarketplaceItems((items) => {
      if (Array.isArray(items)) {
        setProductsList(items);
      }
      setIsLoading(false);
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const categories = ['All', 'Equipment', 'Jerseys', 'Shoes', 'Accessories', 'Rackets', 'Bowling gear'];

  const safeLikedProducts = Array.isArray(likedProducts) ? likedProducts : [];
  const safeProductsList = (Array.isArray(productsList) ? productsList : []).filter(
    p => p && typeof p === 'object' && p.id
  );

  const filteredProducts = selectedCategory === 'All' 
    ? safeProductsList 
    : safeProductsList.filter(p => p && p.category === selectedCategory);

    const isItemOwner = (p) => {
    if (!p) return false;
    if (p.isMine === true) return true;
    if (!user) return false;

    const currentUserId = user?.id || user?.uid || user?.firebase_uid;
    const currentUserName = user?.full_name || user?.name || user?.username;
    const currentUserEmail = (user?.email || '').toLowerCase().trim();
    const itemSellerEmail = (p.sellerEmail || p.seller_email || '').toLowerCase().trim();

    if (currentUserId && (p.seller_id === currentUserId || p.userId === currentUserId || p.sellerId === currentUserId || p.seller_uid === currentUserId)) {
      return true;
    }
    if (currentUserName && (p.sellerName === currentUserName || p.sellerName === 'You')) {
      return true;
    }
    if (currentUserEmail && itemSellerEmail && currentUserEmail === itemSellerEmail) {
      return true;
    }

    try {
      const connected = (typeof getInterconnectedAccounts === 'function') ? getInterconnectedAccounts() : [];
      if (Array.isArray(connected) && connected.length > 0) {
        return connected.some(acc => {
          const accId = acc.id || acc.uid || acc.firebase_uid;
          const accName = acc.full_name || acc.name;
          const accEmail = (acc.email || '').toLowerCase().trim();
          return (
            (accId && (p.seller_id === accId || p.userId === accId || p.sellerId === accId || p.seller_uid === accId)) ||
            (accName && p.sellerName === accName) ||
            (accEmail && itemSellerEmail && accEmail === itemSellerEmail)
          );
        });
      }
    } catch {}

    return false;
  };

  const toggleWishlist = (productId) => {
    if (typeof setLikedProducts === 'function') {
      setLikedProducts(prev => {
        const arr = Array.isArray(prev) ? prev : [];
        return arr.includes(productId) 
          ? arr.filter(id => id !== productId) 
          : [...arr, productId];
      });
    }
  };

  const handleContactSellerAction = (p) => {
    if (!p) return;
    if (typeof onContactSeller === 'function') {
      onContactSeller(p);
      return;
    }

    const sellerNameStr = typeof p.sellerName === 'string' && p.sellerName.trim() ? p.sellerName : 'Gear Seller';
    const sellerId = p.seller_id || p.sellerId || p.seller_uid || p.sellerUid || 'seller_' + sellerNameStr.toLowerCase().replace(/\s+/g, '_');
    const priceStr = p.price != null ? `₹${p.price}` : '';
    const initialMsg = `Hi ${sellerNameStr}! I am interested in buying this product: ${p.name || p.title || 'Sports Gear'}${priceStr ? ` (${priceStr})` : ''}. Is this still available?`;

    const sellerTarget = {
      id: sellerId,
      firebase_uid: sellerId,
      full_name: sellerNameStr,
      name: sellerNameStr,
      displayName: sellerNameStr,
      avatar: p.sellerAvatar || p.image || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
      avatarUrl: p.sellerAvatar || p.image || '',
      role: 'player',
      productName: p.name || p.title || 'Sports Gear',
      productPrice: priceStr,
      productImage: p.image || 'https://images.unsplash.com/photo-1511067007398-7e4b90cfa4bc?q=80&w=400',
      productCondition: p.category || p.condition || 'Equipment',
      initialMessage: initialMsg,
      contextBanner: {
        type: 'marketplace',
        title: p.name || p.title || 'Sports Gear',
        price: priceStr,
        image: p.image || 'https://images.unsplash.com/photo-1511067007398-7e4b90cfa4bc?q=80&w=400',
        subtitle: p.category || p.condition || 'Equipment'
      }
    };

    try {
      localStorage.setItem('turfington_target_chat_user', JSON.stringify(sellerTarget));
      window.dispatchEvent(new CustomEvent('turfington_open_direct_chat_target', { detail: sellerTarget }));
    } catch {}

    if (typeof setTab === 'function') {
      setTab('community');
    }
  };

  const handleImageUpload = async (e, setImg, setPrev) => {
    const file = e.target.files?.[0];
    if (file) {
      const compressed = await compressDataUrlOrFile(file, 800, 0.75);
      setImg(compressed);
      if (setPrev) setPrev(compressed);
    }
  };

  const handleRemoveImage = () => {
    setItemImage('');
    setImagePreview(null);
  };

  // Submit Listing
  const handleListProduct = async (e) => {
    e.preventDefault();
    if (!itemName || !itemPrice || !confirmPhoto || !confirmPrice) return;

    let presetImage = 'https://images.unsplash.com/photo-1511067007398-7e4b90cfa4bc?q=80&w=400'; 
    if (itemCategory === 'Equipment' || itemCategory === 'Jerseys') {
      presetImage = 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=400'; 
    } else if (itemCategory === 'Shoes') {
      presetImage = 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=400';
    } else if (itemCategory === 'Rackets') {
      presetImage = 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80&w=400'; 
    } else if (itemCategory === 'Bowling gear') {
      presetImage = 'https://images.unsplash.com/photo-1565992441121-4367fe2034cf?q=80&w=400';
    }

    const finalImage = itemImage || presetImage;

    const newListing = {
      name: itemName,
      category: itemCategory,
      image_url: finalImage,
      image: finalImage,
      price: parseFloat(itemPrice),
      condition: itemCondition,
      description: itemDesc,
      seller_id: user?.id || user?.uid || user?.firebase_uid || 'usr_me',
      sellerId: user?.id || user?.uid || user?.firebase_uid || 'usr_me',
      seller_uid: user?.id || user?.uid || user?.firebase_uid || 'usr_me',
      sellerEmail: user?.email || '',
      seller_email: user?.email || '',
      sellerName: user?.full_name || user?.name || user?.username || 'You',
      sellerAvatar: user?.avatar_url || user?.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(user?.full_name || user?.name || 'Athlete')}`,
      isMine: true
    };

    setListSuccess(true);
    const res = await apiCreateMarketplaceItem(newListing);
    if (res.success && res.item) {
      setProductsList(prev => [{ ...res.item, isMine: true }, ...prev]);
      setTimeout(() => {
        setListSuccess(false);
        setItemName('');
        setItemPrice('');
        setItemDesc('');
        setItemImage('');
        setImagePreview(null);
        setItemCondition('New (Sealed Pack)');
        setConfirmPhoto(false);
        setConfirmPrice(false);
        setActiveSection('browse');
      }, 800);
    } else {
      setListSuccess(false);
    }
  };

  // Handle Edit Save
  const handleSaveEditProduct = async (e) => {
    e.preventDefault();
    if (!editingProduct) return;

    const updatedData = {
      name: editForm.name,
      category: editForm.category,
      price: parseFloat(editForm.price) || editingProduct.price,
      condition: editForm.condition,
      tag: editForm.condition,
      description: editForm.description,
      image: editForm.image || editingProduct.image || editingProduct.image_url,
      image_url: editForm.image || editingProduct.image_url
    };

    await apiUpdateMarketplaceItem(editingProduct.id, updatedData);

    setProductsList(prev => prev.map(item => item.id === editingProduct.id ? { ...item, ...updatedData } : item));
    setEditingProduct(null);
  };

  // Handle Delete Confirm
  const handleConfirmDeleteProduct = async () => {
    if (!deletingProduct) return;

    await apiDeleteMarketplaceItem(deletingProduct.id);

    setProductsList(prev => prev.filter(item => item.id !== deletingProduct.id));
    setDeletingProduct(null);
  };

  // Helper to color code condition tags
  const getTagColors = (tag) => {
    const text = (tag || '').toLowerCase();
    if (text.includes('sealed') || text.includes('new')) {
      return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    } else if (text.includes('like new')) {
      return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
    } else if (text.includes('good')) {
      return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    } else {
      return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    }
  };

  return (
    <div className="min-h-screen bg-transparent pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative text-left">
      
      {/* 1. SHOP HEADER & CONTROLS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-black font-display tracking-tight uppercase">Peer-to-Peer Marketplace</h1>
          <p className="text-xs text-neutral-500 mt-1">Buy and sell sports gear directly within the Turfington athletic community</p>
        </div>

        {/* View togglers */}
        <div className="flex items-center space-x-3.5 self-start md:self-end">
          <div className="flex bg-[#121212] border border-white/5 p-1 rounded-full text-xs font-bold">
            <button 
              onClick={() => setActiveSection('browse')}
              className={`px-5 py-2.5 rounded-full flex items-center space-x-1.5 transition-all cursor-pointer ${
                activeSection === 'browse' ? 'bg-white text-black font-extrabold' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Browse Gear</span>
            </button>
            
            <button 
              onClick={() => setActiveSection('sell')}
              className={`px-5 py-2.5 rounded-full flex items-center space-x-1.5 transition-all cursor-pointer ${
                activeSection === 'sell' ? 'bg-white text-black font-extrabold' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>List Your Gear</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. MAIN WORKSPACE VIEW */}
      {activeSection === 'browse' ? (
        <>
          {/* CATEGORIES NAVIGATION */}
          <div className="flex space-x-2.5 overflow-x-auto no-scrollbar pb-6 mb-8 max-w-full">
            {categories.map(c => (
              <button
                key={c}
                onClick={() => setSelectedCategory(c)}
                className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all flex-shrink-0 cursor-pointer ${
                  selectedCategory === c 
                    ? 'bg-white text-black font-extrabold shadow-md' 
                    : 'bg-white/[0.02] text-neutral-400 hover:text-white border border-white/5'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* PRODUCTS GRID */}
          {filteredProducts.length === 0 ? (
            <div className="glass-card p-12 text-center border border-white/5 rounded-3xl max-w-lg mx-auto my-8 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto text-2xl">
                🛍️
              </div>
              <h3 className="text-xl font-bold font-display text-white">No Gear Listed Yet</h3>
              <p className="text-xs text-neutral-400 font-light max-w-sm mx-auto leading-relaxed">
                Only gear uploaded by verified athletes and members appears here. Have equipment, shoes, or sports apparel to sell?
              </p>
              <button
                type="button"
                onClick={() => setActiveSection('sell')}
                className="inline-flex items-center space-x-2 px-6 py-3 bg-white hover:bg-neutral-200 text-black text-xs font-extrabold rounded-full transition-all cursor-pointer hover:scale-105 shadow-lg"
              >
                <PlusCircle className="w-4 h-4" />
                <span>List Your Gear</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredProducts.map(p => {
              const isLiked = safeLikedProducts.includes(p.id);
              const tagColors = getTagColors(p.tag || p.condition);
              const isMine = isItemOwner(p);
              const sellerDisplayName = typeof p.sellerName === 'string' && p.sellerName.trim() ? p.sellerName : 'Community Member';

              return (
                <div 
                  key={p.id} 
                  className="glass-card overflow-hidden group border border-white/5 hover:border-white/10 transition-all duration-300 flex flex-col text-left"
                >
                  <div className="h-60 overflow-hidden relative bg-neutral-900/50">
                    <img 
                      src={p.image || p.image_url || 'https://images.unsplash.com/photo-1511067007398-7e4b90cfa4bc?q=80&w=400'} 
                      alt={p.name || 'Sports Equipment'} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500"
                    />
                    
                    <div className="absolute top-4 left-4 flex flex-col space-y-2">
                      <span className={`text-[9px] uppercase font-black tracking-wider bg-black/85 backdrop-blur-md px-2.5 py-1 rounded-md border ${tagColors}`}>
                        {p.tag || p.condition || 'Pre-owned'}
                      </span>

                      {/* Owner Badge */}
                      {isMine && (
                        <span className="text-[9px] uppercase font-black tracking-wider bg-violet-600/90 text-white backdrop-blur-md px-2.5 py-1 rounded-md border border-violet-400/40">
                          🏷️ Listed By You
                        </span>
                      )}
                    </div>

                    {/* Action buttons top right: Wishlist OR Edit/Delete if owned */}
                    <div className="absolute top-4 right-4 flex items-center space-x-2">
                      {isMine ? (
                        <>
                          <button 
                            type="button"
                            onClick={() => {
                              setEditingProduct(p);
                              setEditForm({
                                name: p.name || '',
                                category: p.category || 'Equipment',
                                price: p.price || '',
                                condition: p.condition || p.tag || 'New (Sealed Pack)',
                                description: p.description || '',
                                image: p.image || p.image_url || ''
                              });
                            }}
                            className="p-2 bg-black/70 backdrop-blur-md hover:bg-violet-600 text-white rounded-full border border-white/10 transition-all cursor-pointer shadow-lg"
                            title="Edit Product"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-violet-300 hover:text-white" />
                          </button>

                          <button 
                            type="button"
                            onClick={() => setDeletingProduct(p)}
                            className="p-2 bg-black/70 backdrop-blur-md hover:bg-rose-600 text-white rounded-full border border-white/10 transition-all cursor-pointer shadow-lg"
                            title="Delete Product"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-400 hover:text-white" />
                          </button>
                        </>
                      ) : (
                        <button 
                          onClick={() => toggleWishlist(p.id)}
                          className="p-2.5 bg-black/60 backdrop-blur-md hover:bg-neutral-800 rounded-full border border-white/5 transition-all text-neutral-400 hover:text-rose-500 cursor-pointer"
                        >
                          <Heart className={`w-4 h-4 ${isLiked ? 'text-rose-500 fill-rose-500' : ''}`} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-5 flex flex-col flex-grow justify-between space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-2.5">
                        <div className="flex items-center space-x-1.5">
                          {p.sellerAvatar ? (
                            <img src={p.sellerAvatar} className="w-4.5 h-4.5 rounded-full object-cover border border-white/10" alt={sellerDisplayName} />
                          ) : (
                            <div className="w-4.5 h-4.5 rounded-full bg-indigo-600 flex items-center justify-center text-[8px] font-bold text-white">
                              {sellerDisplayName[0] || 'S'}
                            </div>
                          )}
                          <span className="text-[10px] text-neutral-400 font-bold truncate max-w-[120px]">
                            {isMine ? 'You (Owner)' : sellerDisplayName}
                          </span>
                        </div>
                        <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-extrabold">
                          {p.category || 'Gear'}
                        </span>
                      </div>

                      <h3 className="font-display font-bold text-white text-base leading-snug group-hover:text-neutral-200 transition-colors">
                        {p.name || 'Equipment'}
                      </h3>

                      {p.description && (
                        <p className="text-xs text-neutral-400 font-light mt-1.5 line-clamp-2">
                          {p.description}
                        </p>
                      )}
                    </div>

                    {/* Card Footer: Price & Owner Action / Chat Action */}
                    <div className="flex justify-between items-center pt-4 border-t border-white/5">
                      <span className="font-display font-black text-lg text-white">
                        ₹{p.price ? Number(p.price).toLocaleString('en-IN') : '0'}
                      </span>
                      
                      {isMine ? (
                        <div className="flex items-center space-x-2">
                          <button 
                            type="button"
                            onClick={() => {
                              setEditingProduct(p);
                              setEditForm({
                                name: p.name || '',
                                category: p.category || 'Equipment',
                                price: p.price || '',
                                condition: p.condition || p.tag || 'New (Sealed Pack)',
                                description: p.description || '',
                                image: p.image || p.image_url || ''
                              });
                            }}
                            className="inline-flex items-center space-x-1 px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/35 text-violet-300 text-xs font-bold rounded-full transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>

                          <button 
                            type="button"
                            onClick={() => setDeletingProduct(p)}
                            className="inline-flex items-center space-x-1 px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/35 text-rose-300 hover:text-rose-200 text-xs font-bold rounded-full transition-colors cursor-pointer"
                            title="Delete Listing"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete Listing</span>
                          </button>
                        </div>
                      ) : (
                        <button 
                          type="button"
                          onClick={() => handleContactSellerAction(p)}
                          className="inline-flex items-center space-x-1.5 px-4.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-full transition-colors shadow-[0_0_12px_rgba(99,102,241,0.2)] cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Chat with Seller</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </>
      ) : (
        /* SELL GEAR DASHBOARD FORM */
        <div className="max-w-2xl mx-auto">
          <div className="glass-card p-6 md:p-8 border border-white/5 space-y-6">
            <div className="pb-4 border-b border-white/5">
              <h2 className="font-display font-black text-xl uppercase">List Your Equipment</h2>
              <p className="text-xs text-neutral-500 mt-1">Submit your sports gear to the Turfington community</p>
            </div>

            <form onSubmit={handleListProduct} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Item Name */}
                <div className="space-y-2">
                  <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Product Title</label>
                  <input 
                    type="text" 
                    placeholder="e.g. English Willow Cricket Bat"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    required
                    className="w-full bg-[#0d0d0d] border border-white/5 rounded-xl px-4 py-3.5 text-xs text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-indigo-500/40 transition-colors"
                  />
                </div>

                {/* Category Selection */}
                <div className="space-y-2">
                  <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Category</label>
                  <select 
                    value={itemCategory}
                    onChange={(e) => setItemCategory(e.target.value)}
                    className="w-full bg-[#0d0d0d] border border-white/5 rounded-xl px-3 py-3.5 text-xs text-neutral-300 focus:outline-none focus:border-indigo-500/40 transition-colors"
                  >
                    <option value="Equipment">Equipment</option>
                    <option value="Jerseys">Jerseys</option>
                    <option value="Shoes">Shoes</option>
                    <option value="Accessories">Accessories</option>
                    <option value="Rackets">Rackets</option>
                    <option value="Bowling gear">Bowling gear</option>
                  </select>
                </div>

                {/* Item Price */}
                <div className="space-y-2">
                  <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Price (₹ INR)</label>
                  <input 
                    type="number" 
                    placeholder="e.g. 1500"
                    value={itemPrice}
                    onChange={(e) => setItemPrice(e.target.value)}
                    required
                    className="w-full bg-[#0d0d0d] border border-white/5 rounded-xl px-4 py-3.5 text-xs text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-indigo-500/40 transition-colors"
                  />
                </div>

                {/* Item Condition */}
                <div className="space-y-2">
                  <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Condition</label>
                  <select 
                    value={itemCondition}
                    onChange={(e) => setItemCondition(e.target.value)}
                    className="w-full bg-[#0d0d0d] border border-white/5 rounded-xl px-3 py-3.5 text-xs text-neutral-300 focus:outline-none focus:border-indigo-500/40 transition-colors"
                  >
                    <option value="New (Sealed Pack)">New (Sealed Pack)</option>
                    <option value="Pre-owned (Like New)">Pre-owned (Like New)</option>
                    <option value="Pre-owned (Good)">Pre-owned (Good)</option>
                    <option value="Pre-owned (Fair)">Pre-owned (Fair)</option>
                  </select>
                </div>

              </div>

              {/* Upload Product Photo */}
              <div className="space-y-2">
                <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold block">
                  Upload Product Photo
                </label>

                {imagePreview ? (
                  <div className="relative w-full h-52 rounded-2xl overflow-hidden border border-white/10 group bg-neutral-900">
                    <img src={imagePreview} alt="Product Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-3">
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-full text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer shadow-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Remove Photo</span>
                      </button>
                    </div>
                    <span className="absolute bottom-3 left-3 text-[10px] font-black uppercase bg-black/80 backdrop-blur-md px-2.5 py-1 rounded text-emerald-400 border border-white/10">
                      ✓ Image Ready
                    </span>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-white/10 hover:border-indigo-500/50 bg-[#0d0d0d] hover:bg-white/[0.02] transition-all rounded-2xl p-6 text-center relative group">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, setItemImage, setImagePreview)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                      <div className="p-3 bg-white/5 group-hover:bg-indigo-500/10 text-neutral-400 group-hover:text-indigo-400 rounded-2xl transition-colors">
                        <Upload className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-bold text-white">Click or Drag & Drop Product Image</p>
                      <p className="text-[10px] text-neutral-500">Upload your item photo (PNG, JPG, WEBP)</p>
                    </div>
                  </div>
                )}


              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Product Description</label>
                <textarea 
                  rows="4"
                  placeholder="Describe your item details, minor wear, original pricing, reasons for selling..."
                  value={itemDesc}
                  onChange={(e) => setItemDesc(e.target.value)}
                  className="w-full bg-[#0d0d0d] border border-white/5 rounded-xl px-4 py-3.5 text-xs text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-indigo-500/40 transition-colors resize-none"
                  required
                />
              </div>

              {/* Peer-to-Peer Guidelines & Confirmations */}
              <div className="space-y-3.5 p-5 bg-white/[0.01] border border-white/5 rounded-2xl text-xs font-light">
                <div className="flex items-center space-x-2 pb-2.5 border-b border-white/5 text-neutral-300 font-bold uppercase tracking-wider text-[10px]">
                  <ShieldCheck className="w-4.5 h-4.5 text-indigo-400" />
                  <span>Community Peer-to-Peer Rules</span>
                </div>
                <p className="text-neutral-500 text-[11px] leading-relaxed">
                  Turfington acts solely as a P2P listing platform (similar to OLX). You will connect with buyers directly in your chat portal. Payments, handovers, or shipping are arranged directly.
                </p>
                <div className="space-y-3 pt-1">
                  <label className="flex items-start space-x-3 text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={confirmPhoto}
                      onChange={(e) => setConfirmPhoto(e.target.checked)}
                      required 
                      className="rounded bg-black border-white/10 text-indigo-600 focus:ring-0 focus:ring-offset-0 w-4 h-4 mt-0.5" 
                    />
                    <span className="leading-tight">I confirm the uploaded image or description is clear, accurate, and represents the actual gear.</span>
                  </label>
                  <label className="flex items-start space-x-3 text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={confirmPrice}
                      onChange={(e) => setConfirmPrice(e.target.checked)}
                      required 
                      className="rounded bg-black border-white/10 text-indigo-600 focus:ring-0 focus:ring-offset-0 w-4 h-4 mt-0.5" 
                    />
                    <span className="leading-tight">I confirm the price listed is reasonable, fair, and not overpriced.</span>
                  </label>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center space-x-4 pt-2">
                <button 
                  type="button"
                  onClick={() => setActiveSection('browse')}
                  className="flex-1 py-4 text-xs font-bold border border-white/10 hover:bg-white/5 rounded-full text-center cursor-pointer transition-all"
                >
                  Cancel
                </button>
                
                <button 
                  type="submit"
                  disabled={listSuccess || !confirmPhoto || !confirmPrice}
                  className="flex-1 py-4 bg-white text-black font-extrabold text-xs uppercase tracking-widest rounded-full hover:bg-neutral-200 transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-30 disabled:hover:bg-white transition-all cursor-pointer"
                >
                  {listSuccess ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Listing Live!</span>
                    </>
                  ) : (
                    <span>List Item</span>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ── 3. EDIT PRODUCT MODAL ───────────────────────── */}
      <AnimatePresence>
        {editingProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.8 }} exit={{ opacity: 0 }}
              onClick={() => setEditingProduct(null)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 15 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative glass-card border border-white/10 rounded-3xl p-6 md:p-8 max-w-lg w-full z-10 text-left space-y-6 shadow-2xl my-8">
              
              <div className="flex items-center justify-between border-b border-white/8 pb-4">
                <div>
                  <h3 className="font-display font-black text-white text-lg uppercase tracking-tight">Edit Your Listing</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">Update details for {editingProduct?.name || 'Listing'}</p>
                </div>
                <button type="button" onClick={() => setEditingProduct(null)} className="p-2 rounded-full bg-white/5 text-neutral-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveEditProduct} className="space-y-4">
                <div>
                  <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold block mb-1">Product Title</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    required
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-violet-500/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold block mb-1">Category</label>
                    <select
                      value={editForm.category}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                      className="w-full bg-[#0d0d0d] border border-white/10 rounded-xl px-3 py-3 text-xs text-white focus:outline-none focus:border-violet-500/50"
                    >
                      <option value="Equipment">Equipment</option>
                      <option value="Jerseys">Jerseys</option>
                      <option value="Shoes">Shoes</option>
                      <option value="Accessories">Accessories</option>
                      <option value="Rackets">Rackets</option>
                      <option value="Bowling gear">Bowling gear</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold block mb-1">Price (₹)</label>
                    <input
                      type="number"
                      value={editForm.price}
                      onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                      required
                      className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-violet-500/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold block mb-1">Condition</label>
                  <select
                    value={editForm.condition}
                    onChange={(e) => setEditForm({ ...editForm, condition: e.target.value })}
                    className="w-full bg-[#0d0d0d] border border-white/10 rounded-xl px-3 py-3 text-xs text-white focus:outline-none focus:border-violet-500/50"
                  >
                    <option value="New (Sealed Pack)">New (Sealed Pack)</option>
                    <option value="Pre-owned (Like New)">Pre-owned (Like New)</option>
                    <option value="Pre-owned (Good)">Pre-owned (Good)</option>
                    <option value="Pre-owned (Fair)">Pre-owned (Fair)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold block mb-1">Photo (Choose Local File)</label>
                  <div>
                    <label className="w-full py-2.5 px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-xs font-bold cursor-pointer flex items-center justify-center space-x-2">
                      <Camera className="w-4 h-4 text-violet-400" />
                      <span>Choose / Change Local Photo File</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageUpload(e, (val) => setEditForm(f => ({ ...f, image: val })))}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold block mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-violet-500/50 resize-none"
                  />
                </div>

                <div className="flex items-center justify-between pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      const itemToDelete = editingProduct;
                      setEditingProduct(null);
                      setDeletingProduct(itemToDelete);
                    }}
                    className="inline-flex items-center space-x-1 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-bold rounded-full transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Listing</span>
                  </button>

                  <div className="flex items-center space-x-3">
                    <button
                      type="button"
                      onClick={() => setEditingProduct(null)}
                      className="px-5 py-2.5 rounded-full text-xs font-bold text-neutral-400 hover:text-white cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white font-extrabold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-violet-600/30"
                    >
                      Save Listing Changes
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── 4. DELETE CONFIRMATION MODAL ────────────────── */}
      <AnimatePresence>
        {deletingProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.8 }} exit={{ opacity: 0 }}
              onClick={() => setDeletingProduct(null)} className="absolute inset-0 bg-black/85 backdrop-blur-md" />
            
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 15 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative glass-card border border-rose-500/30 rounded-3xl p-6 max-w-md w-full z-10 text-left space-y-4 shadow-2xl">
              
              <div className="flex items-center space-x-3 pb-3 border-b border-white/10">
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-full text-rose-400">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-extrabold text-white text-base">Delete Marketplace Listing?</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">This item will be permanently removed from Marketplace</p>
                </div>
              </div>

              <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-1 text-xs">
                <p className="font-bold text-white">{deletingProduct?.name || 'Listing'}</p>
                <p className="text-neutral-400">Category: {deletingProduct?.category || 'Equipment'} • Price: ₹{deletingProduct?.price ? Number(deletingProduct.price).toLocaleString('en-IN') : '0'}</p>
              </div>

              <p className="text-xs text-neutral-400 font-light leading-relaxed">
                Are you sure you want to delete this gear listing? Buyers will no longer be able to discover or inquire about this product.
              </p>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingProduct(null)}
                  className="px-5 py-2.5 rounded-full text-xs font-bold text-neutral-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteProduct}
                  className="px-6 py-2.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-rose-600/30"
                >
                  Delete Listing
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
