"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  getBusinesses,
  createBusiness,
  unlockBusiness,
  setBusinessPassword,
  getProducts,
  createProduct,
  updateProduct,
  uploadProductImage,
  getSales,
  recordSale,
  parseSaleWithCopilot,
} from "@/lib/api";
import { Business, Product, Sale, CopilotParseResponse } from "@/types";

export default function DashboardPage() {
  const router = useRouter();

  // Authentication State
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Business State
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeBusiness, setActiveBusiness] = useState<Business | null>(null);
  const [newBizName, setNewBizName] = useState("");
  const [newBizCurrency, setNewBizCurrency] = useState("NGN");
  const [newBizPassword, setNewBizPassword] = useState("");
  const [creatingBiz, setCreatingBiz] = useState(false);

  // Store Password Protection & Unlock State (sessionStorage)
  const [unlockedStores, setUnlockedStores] = useState<string[]>([]);
  const [unlockPasswordInput, setUnlockPasswordInput] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // Set / Change Password Modal State
  const [setPasswordModalOpen, setSetPasswordModalOpen] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  // Products State
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [newProduct, setNewProduct] = useState({
    sku: "",
    name: "",
    category: "General",
    unit: "piece",
    cost_price: 0,
    selling_price: 0,
    stock_qty: 10,
    low_stock_threshold: 5,
  });
  const [newProductImageFile, setNewProductImageFile] = useState<File | null>(null);
  const [newProductImagePreview, setNewProductImagePreview] = useState<string | null>(null);
  const [creatingProduct, setCreatingProduct] = useState(false);

  // Edit Product Modal State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: "",
    sku: "",
    category: "General",
    unit: "piece",
    cost_price: 0,
    selling_price: 0,
    stock_qty: 0,
    low_stock_threshold: 5,
    image_url: null as string | null,
  });
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Quick Sale State
  const [selectedProductId, setSelectedProductId] = useState("");
  const [saleQuantity, setSaleQuantity] = useState(1);
  const [saleDiscount, setSaleDiscount] = useState(0);
  const [processingSale, setProcessingSale] = useState(false);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);

  // AI Copilot State
  const [copilotNote, setCopilotNote] = useState("");
  const [copilotParsing, setCopilotParsing] = useState(false);
  const [copilotProposal, setCopilotProposal] = useState<CopilotParseResponse | null>(null);
  const [confirmingCopilotSale, setConfirmingCopilotSale] = useState(false);

  // Alerts & Notifications
  const [bannerMessage, setBannerMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Left Navigation Rail State
  const [activeNav, setActiveNav] = useState("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navSections = [
    { id: "overview", label: "Overview / Dashboard", icon: "📊" },
    { id: "add-product", label: "+ Add Product", icon: "➕" },
    { id: "copilot", label: "AI Sales Copilot", icon: "✨" },
    { id: "catalog", label: "Catalog & Inventory", icon: "📦" },
    { id: "quick-sale", label: "Quick Sale POS", icon: "⚡" },
    { id: "recent-sales", label: "Recent Sales & Credit", icon: "🧾" },
  ];

  const handleNavClick = (sectionId: string) => {
    setActiveNav(sectionId);
    setMobileNavOpen(false);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  /**
   * 0. Initialize unlocked store IDs from sessionStorage
   */
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("ojapilot_unlocked_stores");
      if (stored) {
        setUnlockedStores(JSON.parse(stored));
      }
    } catch {
      // sessionStorage unavailable
    }
  }, []);

  // Check if active business requires unlock
  const isStoreLocked = Boolean(
    activeBusiness &&
    activeBusiness.has_password &&
    !unlockedStores.includes(activeBusiness.id)
  );

  /**
   * 1. Check user session on mount.
   * If not logged in, redirect to the login page.
   */
  useEffect(() => {
    async function initAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          // If no active session, redirect to login
          router.push("/login");
          return;
        }
        setUserEmail(session.user.email ?? "Authenticated User");
      } catch {
        router.push("/login");
      } finally {
        setAuthLoading(false);
      }
    }

    initAuth();
  }, [router]);

  /**
   * 2. Load businesses for the authenticated user.
   */
  useEffect(() => {
    if (!userEmail) return;

    async function loadBusinesses() {
      try {
        const bizList = await getBusinesses();
        setBusinesses(bizList);
        if (bizList.length > 0 && !activeBusiness) {
          setActiveBusiness(bizList[0]);
        }
      } catch (err: unknown) {
        console.warn("Could not load businesses:", err);
      }
    }

    loadBusinesses();
  }, [userEmail, activeBusiness]);

  /**
   * 3. Load products and sales when active business changes.
   */
  useEffect(() => {
    if (!activeBusiness) {
      setProducts([]);
      setRecentSales([]);
      return;
    }

    // Do not fetch or expose sensitive products/sales if store is locked
    if (activeBusiness.has_password && !unlockedStores.includes(activeBusiness.id)) {
      setProducts([]);
      setRecentSales([]);
      return;
    }

    async function loadBusinessData() {
      setProductsLoading(true);
      try {
        const [prodList, salesList] = await Promise.all([
          getProducts(activeBusiness!.id),
          getSales(activeBusiness!.id),
        ]);
        setProducts(prodList);
        setRecentSales(salesList);
        if (prodList.length > 0 && !selectedProductId) {
          setSelectedProductId(prodList[0].id);
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setBannerMessage({ type: "error", text: err.message });
        }
      } finally {
        setProductsLoading(false);
      }
    }

    loadBusinessData();
  }, [activeBusiness, unlockedStores]);

  // Selected product details for sale calculation
  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const estimatedLineTotal = selectedProduct ? selectedProduct.selling_price * saleQuantity : 0;
  const estimatedGrandTotal = Math.max(0, estimatedLineTotal - saleDiscount);

  // Computed Store KPI Metrics for Active Workspace
  const totalRevenue = recentSales.reduce((acc, sale) => acc + (Number(sale.total_amount) || 0), 0);
  const totalSalesCount = recentSales.length;
  const lowStockCount = products.filter((p) => p.stock_qty <= p.low_stock_threshold).length;
  const totalOutstandingCredit = recentSales.reduce((acc, sale) => acc + (Number(sale.balance_due) || 0), 0);

  /**
   * Handler: Create a new Business (with required password protection)
   */
  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBizName.trim()) return;
    if (!newBizPassword.trim()) {
      setBannerMessage({
        type: "error",
        text: "Please provide a store password or PIN to secure this store.",
      });
      return;
    }

    setCreatingBiz(true);
    setBannerMessage(null);

    try {
      const created = await createBusiness({
        name: newBizName.trim(),
        currency: newBizCurrency,
        password: newBizPassword.trim(),
      });
      setBusinesses((prev) => [...prev, created]);
      setActiveBusiness(created);

      // Automatically mark newly created store as unlocked in sessionStorage
      const updated = [...unlockedStores, created.id];
      setUnlockedStores(updated);
      try {
        sessionStorage.setItem("ojapilot_unlocked_stores", JSON.stringify(updated));
      } catch {}

      setNewBizName("");
      setNewBizPassword("");
      setBannerMessage({
        type: "success",
        text: `Store "${created.name}" created and password-protected! You are assigned as Owner.`,
      });
    } catch (err: unknown) {
      setBannerMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to create business",
      });
    } finally {
      setCreatingBiz(false);
    }
  };

  /**
   * Handler: Unlock a password-protected store
   */
  const handleUnlockStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !unlockPasswordInput) return;

    setUnlocking(true);
    setUnlockError(null);

    try {
      await unlockBusiness(activeBusiness.id, unlockPasswordInput);
      const updated = [...unlockedStores, activeBusiness.id];
      setUnlockedStores(updated);
      try {
        sessionStorage.setItem("ojapilot_unlocked_stores", JSON.stringify(updated));
      } catch {}

      setUnlockPasswordInput("");
      setBannerMessage({
        type: "success",
        text: `Store "${activeBusiness.name}" unlocked successfully!`,
      });
    } catch (err: unknown) {
      setUnlockError(err instanceof Error ? err.message : "Incorrect store password");
    } finally {
      setUnlocking(false);
    }
  };

  /**
   * Handler: Lock active store (clears unlock status in sessionStorage)
   */
  const handleLockStore = () => {
    if (!activeBusiness) return;
    const updated = unlockedStores.filter((id) => id !== activeBusiness.id);
    setUnlockedStores(updated);
    try {
      sessionStorage.setItem("ojapilot_unlocked_stores", JSON.stringify(updated));
    } catch {}
    setUnlockPasswordInput("");
    setUnlockError(null);
    setBannerMessage({
      type: "success",
      text: `Store "${activeBusiness.name}" has been locked.`,
    });
  };

  /**
   * Handler: Set or update store password
   */
  const handleSetStorePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !pwdNew.trim()) return;

    setPwdSaving(true);
    setPwdError(null);

    try {
      const res = await setBusinessPassword(activeBusiness.id, {
        new_password: pwdNew.trim(),
        current_password: activeBusiness.has_password ? pwdCurrent.trim() : undefined,
      });

      // Update active business and list
      const updatedBiz = { ...activeBusiness, has_password: true };
      setActiveBusiness(updatedBiz);
      setBusinesses((prev) => prev.map((b) => (b.id === activeBusiness.id ? updatedBiz : b)));

      // Ensure store is marked unlocked for this session
      if (!unlockedStores.includes(activeBusiness.id)) {
        const updated = [...unlockedStores, activeBusiness.id];
        setUnlockedStores(updated);
        try {
          sessionStorage.setItem("ojapilot_unlocked_stores", JSON.stringify(updated));
        } catch {}
      }

      setSetPasswordModalOpen(false);
      setPwdNew("");
      setPwdCurrent("");
      setBannerMessage({
        type: "success",
        text: res.message || "Store password saved successfully!",
      });
    } catch (err: unknown) {
      setPwdError(err instanceof Error ? err.message : "Failed to update store password");
    } finally {
      setPwdSaving(false);
    }
  };

  /**
   * Handler: Create a new Product
   */
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness) {
      setBannerMessage({ type: "error", text: "Please select or create a business first." });
      return;
    }

    setCreatingProduct(true);
    setBannerMessage(null);

    try {
      let imageUrl: string | null = null;
      if (newProductImageFile) {
        try {
          const uploadRes = await uploadProductImage(newProductImageFile);
          imageUrl = uploadRes.image_url;
        } catch (uploadErr) {
          console.warn("Direct image upload failed, falling back to data/preview URL:", uploadErr);
          imageUrl = newProductImagePreview;
        }
      }

      const created = await createProduct({
        business_id: activeBusiness.id,
        sku: newProduct.sku.trim(),
        name: newProduct.name.trim(),
        category: newProduct.category,
        unit: newProduct.unit,
        cost_price: Number(newProduct.cost_price),
        selling_price: Number(newProduct.selling_price),
        stock_qty: Number(newProduct.stock_qty),
        low_stock_threshold: Number(newProduct.low_stock_threshold),
        image_url: imageUrl,
      });

      setProducts((prev) => [...prev, created]);
      if (!selectedProductId) setSelectedProductId(created.id);

      // Reset form
      setNewProduct({
        sku: "",
        name: "",
        category: "General",
        unit: "piece",
        cost_price: 0,
        selling_price: 0,
        stock_qty: 10,
        low_stock_threshold: 5,
      });
      setNewProductImageFile(null);
      setNewProductImagePreview(null);

      setBannerMessage({
        type: "success",
        text: `Product "${created.name}" added with ${created.stock_qty} in stock.`,
      });
    } catch (err: unknown) {
      setBannerMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to create product",
      });
    } finally {
      setCreatingProduct(false);
    }
  };

  /**
   * Handler: Open Edit Modal for a Product
   */
  const handleOpenEditModal = (product: Product) => {
    setEditingProduct(product);
    setEditFormData({
      name: product.name,
      sku: product.sku,
      category: product.category || "General",
      unit: product.unit || "piece",
      cost_price: product.cost_price,
      selling_price: product.selling_price,
      stock_qty: product.stock_qty,
      low_stock_threshold: product.low_stock_threshold,
      image_url: product.image_url || null,
    });
    setEditImageFile(null);
    setEditImagePreview(product.image_url || null);
  };

  /**
   * Handler: Save Product Edits
   */
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !activeBusiness) return;

    setSavingEdit(true);
    setBannerMessage(null);

    try {
      let finalImageUrl = editFormData.image_url;
      if (editImageFile) {
        try {
          const uploadRes = await uploadProductImage(editImageFile);
          finalImageUrl = uploadRes.image_url;
        } catch (uploadErr) {
          console.warn("Direct upload failed, using preview URL:", uploadErr);
          finalImageUrl = editImagePreview;
        }
      }

      const updated = await updateProduct(
        editingProduct.id,
        {
          name: editFormData.name.trim(),
          sku: editFormData.sku.trim(),
          category: editFormData.category,
          unit: editFormData.unit,
          cost_price: Number(editFormData.cost_price),
          selling_price: Number(editFormData.selling_price),
          stock_qty: Number(editFormData.stock_qty),
          low_stock_threshold: Number(editFormData.low_stock_threshold),
          image_url: finalImageUrl,
        },
        activeBusiness.id
      );

      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setBannerMessage({
        type: "success",
        text: `Product "${updated.name}" updated successfully!`,
      });
      setEditingProduct(null);
    } catch (err: unknown) {
      setBannerMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update product",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  /**
   * Handler: Record Quick Sale
   */
  const handleRecordSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !selectedProduct) return;

    if (saleQuantity > selectedProduct.stock_qty) {
      setBannerMessage({
        type: "error",
        text: `Cannot sell ${saleQuantity} units. Only ${selectedProduct.stock_qty} units available in stock.`,
      });
      return;
    }

    setProcessingSale(true);
    setBannerMessage(null);

    try {
      // Client-generated UUID for idempotency protection
      const idempotencyKey = crypto.randomUUID();

      const sale = await recordSale({
        business_id: activeBusiness.id,
        idempotency_key: idempotencyKey,
        items: [
          {
            product_id: selectedProduct.id,
            quantity: Number(saleQuantity),
            unit_price: selectedProduct.selling_price,
          },
        ],
        discount: Number(saleDiscount),
      });

      // Update local product stock
      setProducts((prev) =>
        prev.map((p) =>
          p.id === selectedProduct.id
            ? { ...p, stock_qty: p.stock_qty - saleQuantity }
            : p
        )
      );

      // Prepend to recent sales
      setRecentSales((prev) => [sale, ...prev]);

      setBannerMessage({
        type: "success",
        text: `Sale recorded successfully! Total: ₦${sale.total_amount.toLocaleString()}. Stock updated.`,
      });

      setSaleQuantity(1);
      setSaleDiscount(0);
    } catch (err: unknown) {
      setBannerMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to record sale",
      });
    } finally {
      setProcessingSale(false);
    }
  };

  /**
   * Handler: Parse Sale Note with AI Copilot
   */
  const handleParseCopilotNote = async (e?: React.FormEvent, customNote?: string) => {
    if (e) e.preventDefault();
    const textToParse = customNote ?? copilotNote;
    if (!activeBusiness || !textToParse.trim()) return;

    setCopilotParsing(true);
    setBannerMessage(null);

    try {
      const proposal = await parseSaleWithCopilot({
        business_id: activeBusiness.id,
        note: textToParse.trim(),
      });
      setCopilotProposal(proposal);
      if (proposal.items.length === 0) {
        setBannerMessage({
          type: "error",
          text: proposal.explanation || "No matching products found in catalog.",
        });
      }
    } catch (err: unknown) {
      setBannerMessage({
        type: "error",
        text: err instanceof Error ? err.message : "AI Copilot parsing failed",
      });
    } finally {
      setCopilotParsing(false);
    }
  };

  /**
   * Handler: Confirm & Record AI Copilot Proposed Sale
   */
  const handleConfirmCopilotSale = async () => {
    if (!activeBusiness || !copilotProposal || !copilotProposal.suggested_payload) return;

    // Check stock for all items
    for (const item of copilotProposal.items) {
      const prod = products.find((p) => p.id === item.product_id);
      if (prod && item.quantity > prod.stock_qty) {
        setBannerMessage({
          type: "error",
          text: `Cannot confirm sale. Requested ${item.quantity} of '${item.product_name}', but only ${prod.stock_qty} in stock.`,
        });
        return;
      }
    }

    setConfirmingCopilotSale(true);
    setBannerMessage(null);

    try {
      const sale = await recordSale(copilotProposal.suggested_payload);

      // Decrement stock in local state for all sold items
      setProducts((prev) =>
        prev.map((p) => {
          const soldItem = copilotProposal.items.find((it) => it.product_id === p.id);
          if (soldItem) {
            return { ...p, stock_qty: Math.max(0, p.stock_qty - soldItem.quantity) };
          }
          return p;
        })
      );

      // Prepend to recent sales
      setRecentSales((prev) => [sale, ...prev]);

      setBannerMessage({
        type: "success",
        text: `✨ Sale of ₦${sale.total_amount.toLocaleString()} successfully recorded via AI Copilot!`,
      });

      // Clear copilot inputs
      setCopilotNote("");
      setCopilotProposal(null);
    } catch (err: unknown) {
      setBannerMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to record Copilot sale",
      });
    } finally {
      setConfirmingCopilotSale(false);
    }
  };

  /**
   * Handler: Sign Out
   */
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        <p className="animate-pulse text-sm">Verifying session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* 1. Left Navigation Rail (Desktop) */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex-col justify-between h-screen sticky top-0 hidden md:flex z-30 select-none flex-shrink-0">
        <div>
          {/* Logo & Brand Mark */}
          <div className="p-4 border-b border-slate-800 flex items-center space-x-3">
            <img
              src="/ojapilot-logo.png"
              alt="OjaPilot Logo"
              className="w-10 h-10 rounded-xl object-contain bg-slate-950 p-1 border border-slate-700/60 shadow"
            />
            <div>
              <div className="font-extrabold text-base text-white tracking-tight leading-tight">
                OJAPILOT
              </div>
              <div className="text-[10px] text-blue-400 font-semibold tracking-wide uppercase">
                SME Retail Copilot
              </div>
            </div>
          </div>

          {/* Quick-Jump Section Navigation */}
          <div className="p-3 space-y-1">
            <span className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
              Workspace Jump
            </span>
            {navSections.map((nav) => {
              const isActive = activeNav === nav.id;
              return (
                <button
                  key={nav.id}
                  type="button"
                  onClick={() => handleNavClick(nav.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-blue-600/20 text-blue-300 border border-blue-500/40 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <span className="text-sm">{nav.icon}</span>
                  <span>{nav.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Store Workspace Card */}
        <div className="p-3 border-t border-slate-800/80">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-slate-400 text-[10px]">
              <span className="uppercase tracking-wider font-semibold">Active Tenant</span>
              {activeBusiness?.has_password ? (
                <span className="text-amber-300 flex items-center gap-1 font-mono text-[10px]">
                  <span>🔒</span> Protected
                </span>
              ) : (
                <span className="text-emerald-400 flex items-center gap-1 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Online
                </span>
              )}
            </div>
            <div className="font-bold text-white text-xs truncate">
              {activeBusiness ? activeBusiness.name : "No Store Selected"}
            </div>
            <div className="text-[10px] text-slate-500 font-mono truncate">
              {activeBusiness ? `Slug: ${activeBusiness.slug} (${activeBusiness.currency})` : "Create a store to begin"}
            </div>
          </div>
        </div>
      </aside>

      {/* 2. Responsive Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative w-64 max-w-xs bg-slate-900 border-r border-slate-800 flex flex-col justify-between h-full p-4 space-y-4 shadow-2xl z-10">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center space-x-2.5">
                  <img
                    src="/ojapilot-logo.png"
                    alt="OjaPilot Logo"
                    className="w-8 h-8 rounded-lg object-contain bg-slate-950 p-1 border border-slate-700/60"
                  />
                  <div>
                    <div className="font-bold text-sm text-white">OJAPILOT</div>
                    <div className="text-[10px] text-blue-400">SME Retail Copilot</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="w-7 h-7 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center text-xs"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 space-y-1">
                {navSections.map((nav) => {
                  const isActive = activeNav === nav.id;
                  return (
                    <button
                      key={nav.id}
                      type="button"
                      onClick={() => handleNavClick(nav.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? "bg-blue-600/20 text-blue-300 border border-blue-500/40"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                      }`}
                    >
                      <span className="text-sm">{nav.icon}</span>
                      <span>{nav.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full py-2 px-3 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Main Workspace Area */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Top Header Bar */}
        <header className="border-b border-slate-800 bg-slate-900/80 sticky top-0 z-20 backdrop-blur">
          <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            {/* Mobile Hamburger Toggle & Brand Mark */}
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="md:hidden w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm border border-slate-700"
                aria-label="Open Navigation Menu"
              >
                ☰
              </button>
              <div className="flex items-center space-x-2.5">
                <img
                  src="/ojapilot-logo.png"
                  alt="OjaPilot Logo"
                  className="w-8 h-8 rounded-lg object-contain bg-slate-950 p-1 border border-slate-700/60 shadow-sm"
                />
                <div className="flex items-baseline gap-2">
                  <span className="font-black text-base sm:text-lg text-white tracking-tight">
                    OJAPILOT
                  </span>
                  <span className="hidden sm:inline-block text-[11px] px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800/60 font-semibold">
                    SME Business & Inventory Copilot
                  </span>
                </div>
              </div>
            </div>

            {/* Header Right Controls */}
            <div className="flex items-center space-x-3 sm:space-x-4">
              {/* Store Switcher & Lock Controls */}
              {businesses.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <select
                    value={activeBusiness?.id || ""}
                    onChange={(e) => {
                      const b = businesses.find((x) => x.id === e.target.value);
                      if (b) {
                        setActiveBusiness(b);
                        setUnlockPasswordInput("");
                        setUnlockError(null);
                      }
                    }}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-medium"
                  >
                    {businesses.map((biz) => (
                      <option key={biz.id} value={biz.id}>
                        {biz.has_password ? "🔒" : "🏬"} {biz.name} ({biz.currency})
                      </option>
                    ))}
                  </select>

                  {/* Lock / Protect Store Action */}
                  {activeBusiness && (
                    <>
                      {activeBusiness.has_password ? (
                        <button
                          type="button"
                          onClick={handleLockStore}
                          title="Lock Store"
                          className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 hover:border-amber-500/40 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <span>🔒</span>
                          <span className="hidden sm:inline">Lock</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setPwdError(null);
                            setSetPasswordModalOpen(true);
                          }}
                          title="Set Store Password"
                          className="px-2 py-1 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <span>🔒</span>
                          <span className="hidden sm:inline">Set Password</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* User Email Badge */}
              <div className="hidden lg:block text-xs text-slate-400 font-mono bg-slate-950/60 px-2.5 py-1 rounded-md border border-slate-800">
                {userEmail}
              </div>

              {/* Sign Out */}
              <button
                onClick={handleSignOut}
                className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </header>

        {/* Main Dashboard Container */}
        <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Banner Alert */}
        {bannerMessage && (
          <div
            className={`p-4 rounded-xl border text-sm flex items-center justify-between ${
              bannerMessage.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/30 text-rose-300"
            }`}
          >
            <span>{bannerMessage.text}</span>
            <button
              onClick={() => setBannerMessage(null)}
              className="text-xs opacity-70 hover:opacity-100 ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Overview & Tenant Workspace */}
        <div id="overview" className="space-y-6">
          {/* Multi-Tenant Business Banner */}
          {!activeBusiness ? (
            <div className="p-6 rounded-2xl bg-blue-950/40 border border-blue-800/50 space-y-4">
              <h2 className="text-xl font-bold text-white">Create Your Business Workspace</h2>
              <p className="text-sm text-slate-300 max-w-xl">
                OJAPILOT requires a business tenant before creating products or sales.
                Protect your store with a password or PIN to secure POS checkout and inventory data.
              </p>
              <form onSubmit={handleCreateBusiness} className="flex flex-col sm:flex-row gap-3 max-w-xl">
                <input
                  type="text"
                  required
                  placeholder="Store name (e.g. Lagos Superstore)"
                  value={newBizName}
                  onChange={(e) => setNewBizName(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="password"
                  required
                  placeholder="Store Password / PIN *"
                  value={newBizPassword}
                  onChange={(e) => setNewBizPassword(e.target.value)}
                  className="w-full sm:w-48 px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                />
                <button
                  type="submit"
                  disabled={creatingBiz || !newBizName || !newBizPassword}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg disabled:opacity-50 whitespace-nowrap shadow"
                >
                  {creatingBiz ? "Creating..." : "Create Store"}
                </button>
              </form>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                  Active Tenant Workspace
                </span>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    {activeBusiness.name}
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-900/50 text-blue-300 border border-blue-700">
                      {activeBusiness.currency}
                    </span>
                  </h1>
                  {activeBusiness.has_password ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1 font-medium">
                      <span>🔒</span> Password Protected
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setPwdError(null);
                        setSetPasswordModalOpen(true);
                      }}
                      className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-950/60 hover:bg-amber-900 text-amber-300 border border-amber-800 flex items-center gap-1 font-semibold transition-colors"
                      title="Set a password to protect this store"
                    >
                      <span>🔓</span> Unprotected • Set Password
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Tenant Slug: <code className="text-slate-300">{activeBusiness.slug}</code> • Role: Owner
                </p>
              </div>

              {/* Quick Add Another Password-Protected Store */}
              <form onSubmit={handleCreateBusiness} className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  required
                  placeholder="+ New store name"
                  value={newBizName}
                  onChange={(e) => setNewBizName(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="password"
                  required
                  placeholder="PIN / Password *"
                  value={newBizPassword}
                  onChange={(e) => setNewBizPassword(e.target.value)}
                  className="w-full sm:w-36 px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                />
                <button
                  type="submit"
                  disabled={creatingBiz || !newBizName || !newBizPassword}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-lg border border-slate-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {creatingBiz ? "Adding..." : "+ Add Store"}
                </button>
              </form>
            </div>
          )}

          {/* Unprotected Store Prompt Alert */}
          {activeBusiness && !activeBusiness.has_password && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-200">
              <div className="flex items-center gap-2">
                <span className="text-base">⚠️</span>
                <span>
                  <strong>{activeBusiness.name}</strong> has no password set. Protect this store with a password or PIN so only authorized staff can record sales or view catalog.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPwdError(null);
                  setSetPasswordModalOpen(true);
                }}
                className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-semibold rounded-lg text-xs transition-colors whitespace-nowrap ml-3"
              >
                🔒 Set Password
              </button>
            </div>
          )}

          {/* Store KPI Summary Bar */}
          {activeBusiness && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* KPI 1: Total Revenue */}
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between shadow-sm">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Total Revenue ({activeBusiness.currency})
                  </span>
                  <div className="text-2xl font-extrabold text-white">
                    ₦{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Live Sales Volume
                  </span>
                </div>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xl font-bold">
                  ₦
                </div>
              </div>

              {/* KPI 2: Sales Recorded */}
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between shadow-sm">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Sales Recorded
                  </span>
                  <div className="text-2xl font-extrabold text-white">
                    {totalSalesCount}
                  </div>
                  <span className="text-[11px] text-blue-400 flex items-center gap-1 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span> Completed Transactions
                  </span>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-xl font-bold">
                  🧾
                </div>
              </div>

              {/* KPI 3: Low Stock Items */}
              <div
                className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm transition-all ${
                  lowStockCount > 0
                    ? "bg-amber-500/10 border-amber-500/40 text-amber-200 shadow-amber-950/20"
                    : "bg-slate-900 border-slate-800 text-slate-300"
                }`}
              >
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Low Stock Items
                  </span>
                  <div
                    className={`text-2xl font-extrabold ${
                      lowStockCount > 0 ? "text-amber-400" : "text-white"
                    }`}
                  >
                    {lowStockCount}
                  </div>
                  <span
                    className={`text-[11px] flex items-center gap-1 font-medium ${
                      lowStockCount > 0 ? "text-amber-300 font-semibold" : "text-slate-400"
                    }`}
                  >
                    {lowStockCount > 0 ? (
                      <>
                        <span>⚠️</span> Needs Restock Alert
                      </>
                    ) : (
                      <>
                        <span>✓</span> Inventory Healthy
                      </>
                    )}
                  </span>
                </div>
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold border ${
                    lowStockCount > 0
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                      : "bg-slate-800 border-slate-700 text-slate-400"
                  }`}
                >
                  📦
                </div>
              </div>

              {/* KPI 4: Outstanding Credit */}
              <div
                className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm transition-all ${
                  totalOutstandingCredit > 0
                    ? "bg-amber-500/10 border-amber-500/40 text-amber-200 shadow-amber-950/20"
                    : "bg-slate-900 border-slate-800 text-slate-300"
                }`}
              >
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Outstanding Credit ({activeBusiness.currency})
                  </span>
                  <div
                    className={`text-2xl font-extrabold ${
                      totalOutstandingCredit > 0 ? "text-amber-400" : "text-white"
                    }`}
                  >
                    ₦{totalOutstandingCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span
                    className={`text-[11px] flex items-center gap-1 font-medium ${
                      totalOutstandingCredit > 0 ? "text-amber-300 font-semibold" : "text-slate-400"
                    }`}
                  >
                    {totalOutstandingCredit > 0 ? (
                      <>
                        <span>⏳</span> Customer Debt / Credit
                      </>
                    ) : (
                      <>
                        <span>✓</span> Zero Debt Owed
                      </>
                    )}
                  </span>
                </div>
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold border ${
                    totalOutstandingCredit > 0
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                      : "bg-slate-800 border-slate-700 text-slate-400"
                  }`}
                >
                  💳
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Two-Column Working Grid: Products & Quick Sale */}
        {activeBusiness && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Products & Inventory (7 Cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Product Creation Card */}
              <div id="add-product" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <h3 className="text-lg font-bold text-white">Add Product to Inventory</h3>
                <form onSubmit={handleCreateProduct} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Product Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Golden Penny Rice 50kg"
                      value={newProduct.name}
                      onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      SKU (Code) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. RICE-50KG"
                      value={newProduct.sku}
                      onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Selling Price (₦) *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={newProduct.selling_price || ""}
                      onChange={(e) =>
                        setNewProduct({ ...newProduct, selling_price: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Cost Price (₦)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={newProduct.cost_price || ""}
                      onChange={(e) =>
                        setNewProduct({ ...newProduct, cost_price: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Initial Stock Quantity *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={newProduct.stock_qty}
                      onChange={(e) =>
                        setNewProduct({ ...newProduct, stock_qty: parseInt(e.target.value, 10) || 0 })
                      }
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Low Stock Alert Threshold
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={newProduct.low_stock_threshold}
                      onChange={(e) =>
                        setNewProduct({
                          ...newProduct,
                          low_stock_threshold: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Product Image Upload (Optional) */}
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="block text-xs font-medium text-slate-400">
                      Product Image (Optional)
                    </label>
                    <div className="flex items-center gap-3">
                      {newProductImagePreview ? (
                        <div className="relative group w-14 h-14 rounded-lg overflow-hidden border border-slate-700 bg-slate-950 flex-shrink-0">
                          <img
                            src={newProductImagePreview}
                            alt="Preview"
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setNewProductImageFile(null);
                              setNewProductImagePreview(null);
                            }}
                            className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[11px] text-rose-300 font-bold transition-opacity"
                            title="Remove Image"
                          >
                            ✕ Remove
                          </button>
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-lg border border-dashed border-slate-700 flex items-center justify-center text-slate-500 text-xs bg-slate-950 flex-shrink-0">
                          📦
                        </div>
                      )}
                      <div className="flex-1">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setNewProductImageFile(file);
                              setNewProductImagePreview(URL.createObjectURL(file));
                            }
                          }}
                          className="text-xs text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700 cursor-pointer"
                        />
                        <p className="text-[11px] text-slate-500 mt-0.5">PNG, JPG, WEBP, or GIF up to 5MB</p>
                      </div>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      disabled={creatingProduct}
                      className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors shadow"
                    >
                      {creatingProduct ? "Adding Product..." : "Save Product to Catalog"}
                    </button>
                  </div>
                </form>
              </div>

              {/* Product Catalog List */}
              <div id="catalog" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">Current Stock Catalog</h3>
                  <span className="text-xs text-slate-400">
                    {products.length} product{products.length === 1 ? "" : "s"}
                  </span>
                </div>

                {productsLoading ? (
                  <p className="text-xs text-slate-500 py-4">Loading stock levels...</p>
                ) : products.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    No products added yet. Use the form above to add your first product.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                          <th className="pb-2">Product</th>
                          <th className="pb-2">SKU</th>
                          <th className="pb-2">Price (₦)</th>
                          <th className="pb-2">In Stock</th>
                          <th className="pb-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {products.map((p) => {
                          const isLowStock = p.stock_qty <= p.low_stock_threshold;
                          return (
                            <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                              <td className="py-2.5">
                                <div className="flex items-center gap-3">
                                  {p.image_url ? (
                                    <img
                                      src={p.image_url}
                                      alt={p.name}
                                      className="w-10 h-10 rounded-lg object-cover border border-slate-800 bg-slate-950 flex-shrink-0"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center text-slate-400 font-bold text-xs flex-shrink-0">
                                      📦
                                    </div>
                                  )}
                                  <div>
                                    <span className="font-semibold text-white block">{p.name}</span>
                                    {p.category && (
                                      <span className="text-[10px] text-slate-400">{p.category}</span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-2.5 font-mono text-slate-300">{p.sku}</td>
                              <td className="py-2.5 text-slate-300">
                                ₦{p.selling_price.toLocaleString()}
                              </td>
                              <td className="py-2.5">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                    isLowStock
                                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                      : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                  }`}
                                >
                                  {p.stock_qty} {p.unit}
                                  {isLowStock && " (Low)"}
                                </span>
                              </td>
                              <td className="py-2.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModal(p)}
                                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-md text-[11px] font-medium text-slate-200 transition-colors"
                                >
                                  ✏️ Edit
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Quick Sale & History (5 Cols) */}
            <div className="lg:col-span-5 space-y-6">
              {/* AI Copilot Card */}
              <div id="copilot" className="bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950/30 border border-indigo-500/30 rounded-2xl p-6 space-y-4 shadow-xl shadow-indigo-950/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-bold text-sm">
                      ✨
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        AI Sales Copilot
                      </h3>
                      <p className="text-[11px] text-slate-400">Natural language voice & text POS</p>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-700/60 font-semibold tracking-wide">
                    Instant Match
                  </span>
                </div>

                {/* Quick Example Prompt Chips */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-slate-400">Quick Prompt Examples:</label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "Sold 2 Peak milk",
                      "Mama Tunde bought 2 Peak milk owing 500",
                      "3 bread and 1 coke",
                      "Sold 2 rice with 1000 discount",
                    ].map((prompt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setCopilotNote(prompt);
                          handleParseCopilotNote(undefined, prompt);
                        }}
                        className="px-2 py-1 bg-slate-950 hover:bg-indigo-900/40 border border-slate-800 hover:border-indigo-500/40 rounded-md text-[11px] text-slate-300 hover:text-indigo-200 transition-colors"
                      >
                        "{prompt}"
                      </button>
                    ))}
                  </div>
                </div>

                {/* Note Input Form */}
                <form onSubmit={(e) => handleParseCopilotNote(e)} className="space-y-3">
                  <div className="relative">
                    <textarea
                      rows={2}
                      placeholder="Type or paste what happened (e.g. 'Mama Tunde bought 2 Peak milk owing 500')..."
                      value={copilotNote}
                      onChange={(e) => setCopilotNote(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={copilotParsing || !copilotNote.trim()}
                      className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20"
                    >
                      {copilotParsing ? (
                        <>
                          <span className="animate-spin text-xs">⏳</span>
                          <span>Parsing Note...</span>
                        </>
                      ) : (
                        <>
                          <span>✨</span>
                          <span>Parse with Copilot</span>
                        </>
                      )}
                    </button>

                    {copilotProposal && (
                      <button
                        type="button"
                        onClick={() => {
                          setCopilotProposal(null);
                          setCopilotNote("");
                        }}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs rounded-lg transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </form>

                {/* AI Proposal Preview Card */}
                {copilotProposal && (
                  <div className="p-4 rounded-xl bg-slate-950/90 border border-indigo-500/40 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-[11px] font-bold text-indigo-300 flex items-center gap-1.5">
                        <span>📋</span> AI Proposal Preview
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-400 border border-indigo-800 font-mono">
                        {copilotProposal.source === "llm" ? "Gemini LLM" : "Deterministic Engine"}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 font-medium">
                      {copilotProposal.explanation}
                    </p>

                    {copilotProposal.items.length > 0 ? (
                      <>
                        <div className="space-y-1.5 max-h-36 overflow-y-auto">
                          {copilotProposal.items.map((item, idx) => {
                            const currentProd = products.find((p) => p.id === item.product_id);
                            const isInsufficient = currentProd ? item.quantity > currentProd.stock_qty : false;
                            return (
                              <div
                                key={idx}
                                className="flex items-center justify-between text-xs p-2 rounded bg-slate-900 border border-slate-800"
                              >
                                <div>
                                  <span className="font-semibold text-white">{item.product_name}</span>
                                  <span className="text-[11px] text-slate-400 block">
                                    {item.quantity} × ₦{item.unit_price.toLocaleString()}
                                    {isInsufficient && (
                                      <span className="text-rose-400 ml-1 font-bold">
                                        (⚠️ Low: {currentProd?.stock_qty} left)
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <span className="font-mono font-bold text-slate-200">
                                  ₦{item.line_total.toLocaleString()}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800/80 space-y-1.5 text-xs">
                          {copilotProposal.customer_name && (
                            <div className="flex justify-between items-center text-slate-300 text-[11px] pb-1 border-b border-slate-800/60">
                              <span className="text-slate-400">Customer</span>
                              <span className="font-semibold text-indigo-300">👤 {copilotProposal.customer_name}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-slate-400 text-[11px]">
                            <span>Subtotal</span>
                            <span>₦{copilotProposal.subtotal.toLocaleString()}</span>
                          </div>
                          {copilotProposal.discount > 0 && (
                            <div className="flex justify-between text-emerald-400 text-[11px]">
                              <span>Discount</span>
                              <span>- ₦{copilotProposal.discount.toLocaleString()}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-bold text-white text-sm">
                            <span>Grand Total</span>
                            <span className="text-white">₦{copilotProposal.total_amount.toLocaleString()}</span>
                          </div>
                          {copilotProposal.balance_due > 0 && (
                            <div className="pt-1.5 border-t border-slate-800 space-y-1.5">
                              <div className="flex justify-between text-slate-300 text-[11px]">
                                <span>Amount Paid</span>
                                <span className="text-emerald-400 font-semibold">₦{copilotProposal.amount_paid.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between text-amber-400 font-bold text-xs bg-amber-500/10 px-2 py-1 rounded border border-amber-500/30">
                                <span className="flex items-center gap-1">
                                  <span>⏳</span> Balance Owed (Credit)
                                </span>
                                <span>₦{copilotProposal.balance_due.toLocaleString()}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={confirmingCopilotSale}
                          onClick={handleConfirmCopilotSale}
                          className={`w-full py-2.5 px-4 text-white text-xs font-bold rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5 shadow-lg ${
                            copilotProposal.balance_due > 0
                              ? "bg-amber-600 hover:bg-amber-500 shadow-amber-600/20"
                              : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
                          }`}
                        >
                          {confirmingCopilotSale ? (
                            <>
                              <span className="animate-spin text-xs">⏳</span>
                              <span>Recording Sale...</span>
                            </>
                          ) : (
                            <>
                              <span>✓</span>
                              <span>
                                {copilotProposal.balance_due > 0
                                  ? `Confirm & Record Credit Sale (₦${copilotProposal.total_amount.toLocaleString()} • Owing ₦${copilotProposal.balance_due.toLocaleString()})`
                                  : `Confirm & Record Sale (₦${copilotProposal.total_amount.toLocaleString()})`}
                              </span>
                            </>
                          )}
                        </button>
                      </>
                    ) : (
                      <div className="text-center py-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
                        No catalog products matched this note. Try typing exact product names or add items to catalog first.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Quick Sale Checkout Card */}
              <div id="quick-sale" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">Record Quick Sale</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                    Idempotent POS
                  </span>
                </div>

                {products.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4">
                    Add at least one product before recording sales.
                  </p>
                ) : (
                  <form onSubmit={handleRecordSale} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Select Product
                      </label>
                      <select
                        value={selectedProductId}
                        onChange={(e) => setSelectedProductId(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — ₦{p.selling_price.toLocaleString()} ({p.stock_qty} available)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          Quantity
                        </label>
                        <input
                          type="number"
                          required
                          min="1"
                          max={selectedProduct ? selectedProduct.stock_qty : 1}
                          value={saleQuantity}
                          onChange={(e) => setSaleQuantity(parseInt(e.target.value, 10) || 1)}
                          className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          Discount (₦)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={saleDiscount}
                          onChange={(e) => setSaleDiscount(parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    {/* Stock Alert Warning if user types more than available */}
                    {selectedProduct && saleQuantity > selectedProduct.stock_qty && (
                      <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                        ⚠️ Cannot sell {saleQuantity}. Only {selectedProduct.stock_qty} in stock.
                      </div>
                    )}

                    {/* Calculated Receipt Preview */}
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-400">
                        <span>Unit Price</span>
                        <span>₦{selectedProduct ? selectedProduct.selling_price.toLocaleString() : 0}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Subtotal ({saleQuantity} item)</span>
                        <span>₦{estimatedLineTotal.toLocaleString()}</span>
                      </div>
                      {saleDiscount > 0 && (
                        <div className="flex justify-between text-emerald-400">
                          <span>Discount</span>
                          <span>- ₦{saleDiscount.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="pt-1.5 border-t border-slate-800 flex justify-between font-bold text-white text-sm">
                        <span>Total Due</span>
                        <span className="text-blue-400">₦{estimatedGrandTotal.toLocaleString()}</span>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={
                        processingSale ||
                        !selectedProduct ||
                        selectedProduct.stock_qty <= 0 ||
                        saleQuantity > selectedProduct.stock_qty
                      }
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg disabled:opacity-40 transition-colors shadow-lg shadow-emerald-600/20"
                    >
                      {processingSale
                        ? "Recording Sale..."
                        : selectedProduct && selectedProduct.stock_qty <= 0
                        ? "Out of Stock"
                        : `Complete Sale (₦${estimatedGrandTotal.toLocaleString()})`}
                    </button>
                  </form>
                )}
              </div>

              {/* Recent Sales Activity */}
              <div id="recent-sales" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <h3 className="text-lg font-bold text-white">Recent Sales</h3>

                {recentSales.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    No sales recorded yet. Completed transactions will appear here.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {recentSales.slice(0, 5).map((sale) => {
                      const isCreditOrPartial = (sale.balance_due && sale.balance_due > 0) || sale.payment_status === "credit" || sale.payment_status === "partial";
                      return (
                        <div
                          key={sale.id}
                          className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white">
                                ₦{sale.total_amount.toLocaleString()}
                              </span>
                              {sale.customer_name && (
                                <span className="text-[11px] text-indigo-300 font-medium">
                                  • {sale.customer_name}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 font-mono">
                              ID: {sale.id.slice(0, 8)} • {sale.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {isCreditOrPartial ? (
                              <span className="px-2 py-0.5 rounded bg-amber-900/40 text-amber-300 text-[10px] font-semibold border border-amber-700/60 flex items-center gap-1">
                                <span>⏳</span> Owing ₦{(sale.balance_due || 0).toLocaleString()}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-300 text-[10px] font-medium border border-emerald-800">
                                Paid
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Edit Product Modal */}
        {editingProduct && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative my-8">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-bold text-xs">
                    ✏️
                  </span>
                  <h3 className="text-base font-bold text-white">
                    Edit Product
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center text-xs transition-colors"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Product Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={editFormData.name}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      SKU (Code) *
                    </label>
                    <input
                      type="text"
                      required
                      value={editFormData.sku}
                      onChange={(e) => setEditFormData({ ...editFormData, sku: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Category
                    </label>
                    <input
                      type="text"
                      value={editFormData.category}
                      onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Selling Price (₦) *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={editFormData.selling_price}
                      onChange={(e) =>
                        setEditFormData({ ...editFormData, selling_price: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Cost Price (₦)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editFormData.cost_price}
                      onChange={(e) =>
                        setEditFormData({ ...editFormData, cost_price: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Stock Quantity *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={editFormData.stock_qty}
                      onChange={(e) =>
                        setEditFormData({ ...editFormData, stock_qty: parseInt(e.target.value, 10) || 0 })
                      }
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Low Stock Alert Threshold
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editFormData.low_stock_threshold}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          low_stock_threshold: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Image Edit Field */}
                  <div className="sm:col-span-2 space-y-1.5 pt-1">
                    <label className="block text-xs font-medium text-slate-400">
                      Product Image
                    </label>
                    <div className="flex items-center gap-3">
                      {editImagePreview ? (
                        <div className="relative group w-14 h-14 rounded-lg overflow-hidden border border-slate-700 bg-slate-950 flex-shrink-0">
                          <img
                            src={editImagePreview}
                            alt="Edit preview"
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setEditImageFile(null);
                              setEditImagePreview(null);
                              setEditFormData({ ...editFormData, image_url: null });
                            }}
                            className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[11px] text-rose-300 font-bold transition-opacity"
                            title="Remove Image"
                          >
                            ✕ Remove
                          </button>
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-lg border border-dashed border-slate-700 flex items-center justify-center text-slate-500 text-xs bg-slate-950 flex-shrink-0">
                          📦
                        </div>
                      )}
                      <div className="flex-1">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setEditImageFile(file);
                              setEditImagePreview(URL.createObjectURL(file));
                            }
                          }}
                          className="text-xs text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700 cursor-pointer"
                        />
                        <p className="text-[11px] text-slate-500 mt-0.5">Upload new image or remove current</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditingProduct(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow"
                  >
                    {savingEdit ? (
                      <>
                        <span className="animate-spin text-xs">⏳</span>
                        <span>Saving Changes...</span>
                      </>
                    ) : (
                      <>
                        <span>✓</span>
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Store Lock / Password Entry Modal */}
        {isStoreLocked && activeBusiness && (
          <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-5 shadow-2xl relative text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-2xl flex items-center justify-center mx-auto shadow-inner">
                🔒
              </div>

              <div>
                <h3 className="text-lg font-bold text-white">
                  Store Access Locked
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Enter password or PIN to access <span className="font-semibold text-slate-200">{activeBusiness.name}</span>
                </p>
              </div>

              {unlockError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                  ⚠️ {unlockError}
                </div>
              )}

              <form onSubmit={handleUnlockStore} className="space-y-4">
                <div>
                  <input
                    type="password"
                    autoFocus
                    required
                    placeholder="Enter Store Password / PIN"
                    value={unlockPasswordInput}
                    onChange={(e) => setUnlockPasswordInput(e.target.value)}
                    className="w-full px-3 py-2.5 text-center text-sm tracking-widest bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={unlocking || !unlockPasswordInput}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl disabled:opacity-50 transition-colors shadow-lg shadow-blue-600/20 flex items-center justify-center gap-1.5"
                >
                  {unlocking ? (
                    <>
                      <span className="animate-spin text-xs">⏳</span>
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <span>🔓</span>
                      <span>Unlock Store</span>
                    </>
                  )}
                </button>
              </form>

              {businesses.length > 1 && (
                <div className="pt-2 border-t border-slate-800/80">
                  <span className="text-[11px] text-slate-500 block mb-1.5">Or switch to another store:</span>
                  <select
                    value={activeBusiness.id}
                    onChange={(e) => {
                      const b = businesses.find((x) => x.id === e.target.value);
                      if (b) {
                        setActiveBusiness(b);
                        setUnlockPasswordInput("");
                        setUnlockError(null);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
                  >
                    {businesses.map((biz) => (
                      <option key={biz.id} value={biz.id}>
                        {biz.has_password ? "🔒" : "🏬"} {biz.name} ({biz.currency})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Set / Change Store Password Modal */}
        {setPasswordModalOpen && activeBusiness && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center text-sm">
                    🔒
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {activeBusiness.has_password ? "Change Store Password" : "Set Store Password"}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Protect {activeBusiness.name} from unauthorized access
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSetPasswordModalOpen(false)}
                  className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center text-xs"
                >
                  ✕
                </button>
              </div>

              {pwdError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                  ⚠️ {pwdError}
                </div>
              )}

              <form onSubmit={handleSetStorePassword} className="space-y-3">
                {activeBusiness.has_password && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Current Password / PIN *
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="Enter current password"
                      value={pwdCurrent}
                      onChange={(e) => setPwdCurrent(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    New Password / PIN *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Enter new password or PIN"
                    value={pwdNew}
                    onChange={(e) => setPwdNew(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSetPasswordModalOpen(false)}
                    className="px-3.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={pwdSaving || !pwdNew.trim()}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50 shadow"
                  >
                    {pwdSaving ? "Saving..." : activeBusiness.has_password ? "Update Password" : "Save & Protect Store"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  </div>
  );
}
