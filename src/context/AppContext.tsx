import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  HouseholdMember,
  CardMethod,
  Expense,
  TabType,
  ToastNotification,
  SplitMode,
  RecommendationResult,
} from '../types';
import {
  INITIAL_MEMBERS,
  INITIAL_PAYMENT_METHODS,
  INITIAL_EXPENSES,
} from '../data/initialData';
import { executeRecommendCard } from '../mcp/tools';

interface AppContextType {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  members: HouseholdMember[];
  addMember: (name: string, role?: 'lead' | 'member', phone?: string) => HouseholdMember;
  updateMember: (id: string, updates: Partial<HouseholdMember>) => void;
  deleteMember: (id: string) => void;
  setLeadMember: (id: string) => void;
  paymentMethods: CardMethod[];
  expenses: Expense[];
  toast: ToastNotification | null;
  showToast: (message: string, icon?: string) => void;
  addExpense: (expenseData: Omit<Expense, 'id'>) => Expense;
  deleteExpense: (id: string) => void;
  clearExpensesByMonth: (month?: string) => void;
  addPaymentMethod: (method: Omit<CardMethod, 'id'>) => void;
  updatePaymentMethod: (id: string, updates: Partial<CardMethod>) => void;
  deletePaymentMethod: (id: string) => void;
  setDefaultPayerMethod: (id: string) => void;
  markAllSettled: () => void;
  markDebtSettled: (fromMemberId: string, toMemberId: string) => void;
  calculateSplit: (
    amount: number,
    mode: SplitMode,
    payerId: string,
    pairMemberIds?: [string, string],
    customWeights?: Record<string, number>
  ) => Record<string, number>;
  calculateCardEligibility: (
    card: CardMethod,
    amount: number,
    mcc: string,
    category: string
  ) => {
    isEligible: boolean;
    eligibleAmount: number;
    slippage: number;
    isCapped: boolean;
    remainingHeadroom: number;
    projectedSpend: number;
    message: string;
    adviceType: 'ok' | 'warning' | 'capped' | 'info';
  };
  recommendBestCard: (merchant: string, mcc?: string, amount?: number) => RecommendationResult | null;
  netBalances: {
    memberNets: Record<string, number>;
    debts: { from: string; fromName: string; to: string; toName: string; amount: number }[];
    totalMonthSpend: number;
    totalActiveTransactions: number;
  };
  syncData: () => void;
  resetAllData: () => void;
  resetToDefaultMethods: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEY_MEMBERS = 'splitstack_sg_members_v2';
const STORAGE_KEY_METHODS = 'splitstack_sg_methods_v3';
const STORAGE_KEY_EXPENSES = 'splitstack_sg_expenses_v2';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [selectedMonth, setSelectedMonth] = useState<string>('Oct 2024');
  const [toast, setToast] = useState<ToastNotification | null>(null);

  // Household Members state (loaded from localStorage or initial)
  const [members, setMembers] = useState<HouseholdMember[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MEMBERS);
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return INITIAL_MEMBERS;
  });

  // Payment Methods state (initializes to 11 Singapore default methods)
  const [paymentMethods, setPaymentMethods] = useState<CardMethod[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_METHODS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 11) {
          return parsed;
        }
      }
    } catch {
      // fallback
    }
    return INITIAL_PAYMENT_METHODS;
  });

  // Expenses state
  const [expenses, setExpenses] = useState<Expense[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_EXPENSES);
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return INITIAL_EXPENSES;
  });

  // LocalStorage persistence
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MEMBERS, JSON.stringify(members));
    } catch {
      // ignore
    }
  }, [members]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_METHODS, JSON.stringify(paymentMethods));
    } catch {
      // ignore
    }
  }, [paymentMethods]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(expenses));
    } catch {
      // ignore
    }
  }, [expenses]);

  const showToast = (message: string, icon = 'check_circle') => {
    const id = Date.now().toString();
    setToast({ id, message, icon });
    setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 2800);
  };

  // Member management
  const addMember = (name: string, role: 'lead' | 'member' = 'member', phone = '') => {
    const id = `member-${Date.now()}`;
    const newMember: HouseholdMember = {
      id,
      name,
      role,
      phone,
    };
    setMembers((prev) => [...prev, newMember]);
    showToast(`Added ${name} to household!`, 'person_add');
    return newMember;
  };

  const updateMember = (id: string, updates: Partial<HouseholdMember>) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
    showToast(`Updated member details.`);
  };

  const deleteMember = (id: string) => {
    if (members.length <= 1) {
      showToast('Cannot delete the only household member!', 'error');
      return;
    }
    const target = members.find((m) => m.id === id);
    setMembers((prev) => prev.filter((m) => m.id !== id));
    showToast(`Removed ${target?.name || 'member'} from household.`, 'delete');
  };

  const setLeadMember = (id: string) => {
    setMembers((prev) =>
      prev.map((m) => ({
        ...m,
        role: m.id === id ? 'lead' : 'member',
      }))
    );
    const chosen = members.find((m) => m.id === id);
    showToast(`${chosen?.name} is now the Lead Payer!`, 'star');
  };

  // Dynamic Cent-Precision Split Engine across dynamic household members
  const calculateSplit = (
    amount: number,
    mode: SplitMode,
    payerId: string,
    pairMemberIds?: [string, string],
    customWeights?: Record<string, number>
  ): Record<string, number> => {
    const cleanAmount = Math.max(0, Number(amount.toFixed(2)));
    const breakdown: Record<string, number> = {};
    const memberCount = members.length;

    if (memberCount === 0) return {};

    if (mode === 'equal') {
      const baseShare = Math.floor((cleanAmount / memberCount) * 100) / 100;
      let allocatedTotal = baseShare * memberCount;
      const remainderCents = Math.round((cleanAmount - allocatedTotal) * 100);

      members.forEach((m) => {
        breakdown[m.id] = baseShare;
      });

      // Distribute any remainder pennies (1 cent at a time) to the payer or first member
      let extra = remainderCents;
      const targetPayer = members.find((m) => m.id === payerId) ? payerId : members[0].id;
      if (extra > 0 && breakdown[targetPayer] !== undefined) {
        breakdown[targetPayer] = Number((breakdown[targetPayer] + extra / 100).toFixed(2));
      }
      return breakdown;
    }

    if (mode === 'pair' && pairMemberIds && pairMemberIds.length === 2) {
      members.forEach((m) => {
        breakdown[m.id] = 0;
      });
      const [m1, m2] = pairMemberIds;
      const half = Math.floor((cleanAmount / 2) * 100) / 100;
      const rem = Math.round((cleanAmount - half * 2) * 100) / 100;

      breakdown[m1] = Number((half + rem).toFixed(2));
      breakdown[m2] = Number(half.toFixed(2));
      return breakdown;
    }

    if (mode === 'custom' && customWeights) {
      let totalWeight = 0;
      members.forEach((m) => {
        totalWeight += customWeights[m.id] || 0;
      });

      if (totalWeight <= 0) {
        members.forEach((m, idx) => {
          breakdown[m.id] = idx === 0 ? cleanAmount : 0;
        });
        return breakdown;
      }

      let allocated = 0;
      members.forEach((m, idx) => {
        if (idx === members.length - 1) {
          breakdown[m.id] = Number((cleanAmount - allocated).toFixed(2));
        } else {
          const share = Math.round(((cleanAmount * (customWeights[m.id] || 0)) / totalWeight) * 100) / 100;
          breakdown[m.id] = share;
          allocated += share;
        }
      });
      return breakdown;
    }

    // Default: all to payer
    members.forEach((m) => {
      breakdown[m.id] = m.id === payerId ? cleanAmount : 0;
    });
    return breakdown;
  };

  // Card eligibility and $5 block checks
  const calculateCardEligibility = (
    card: CardMethod,
    amount: number,
    mcc: string,
    category: string
  ) => {
    let eligibleAmount = amount;
    let slippage = 0;
    if (card.roundingBlock === 5) {
      const blocks = Math.floor(amount / 5);
      eligibleAmount = blocks * 5;
      slippage = Number((amount - eligibleAmount).toFixed(2));
    } else if (card.roundingBlock === 1) {
      const blocks = Math.floor(amount);
      eligibleAmount = blocks;
      slippage = Number((amount - eligibleAmount).toFixed(2));
    }

    const projectedSpend = card.currentSpend + amount;
    const isCapped = card.bonusCap > 0 && card.currentSpend >= card.bonusCap;
    const remainingHeadroom = card.bonusCap > 0 ? Math.max(0, card.bonusCap - card.currentSpend) : 999999;

    let isEligible = true;
    let message = 'Transaction eligible for primary reward rate.';
    let adviceType: 'ok' | 'warning' | 'capped' | 'info' = 'ok';

    if (card.keyExclusions) {
      const lowerEx = card.keyExclusions.toLowerCase();
      const lowerCat = (category + ' ' + mcc).toLowerCase();
      if (
        (lowerEx.includes('airline') && (mcc === '4511' || lowerCat.includes('flight') || lowerCat.includes('scoot'))) ||
        (lowerEx.includes('utilit') && (mcc === '4900' || mcc === '4814' || lowerCat.includes('util')))
      ) {
        isEligible = false;
        message = `MCC ${mcc} (${category}) is excluded under ${card.name} terms. Earns base rate only.`;
        adviceType = 'warning';
      }
    }

    if (isCapped) {
      message = `${card.name} has already reached its bonus cap ($${card.bonusCap}). Further spend yields base ${card.baseRate}. Consider switching card!`;
      adviceType = 'capped';
    } else if (card.bonusCap > 0 && projectedSpend > card.bonusCap) {
      const over = projectedSpend - card.bonusCap;
      message = `This transaction exceeds the monthly cap by $${over.toFixed(2)}. Excess will earn base rate.`;
      adviceType = 'warning';
    } else if (card.minSpendTarget && card.minSpendTarget > 0) {
      if (card.currentSpend < card.minSpendTarget && projectedSpend >= card.minSpendTarget) {
        message = `Awesome! This transaction unlocks the $${card.minSpendTarget} Tier 2 rebate target.`;
        adviceType = 'ok';
      } else if (projectedSpend > card.minSpendTarget) {
        message = `Target threshold ($${card.minSpendTarget}) surpassed. Consider routing to 4.0 MPD cards.`;
        adviceType = 'info';
      }
    }

    return {
      isEligible,
      eligibleAmount,
      slippage,
      isCapped,
      remainingHeadroom,
      projectedSpend,
      message,
      adviceType,
    };
  };

  // Add Expense
  const addExpense = (expenseData: Omit<Expense, 'id'>) => {
    const id = `exp-${Date.now()}`;
    const newExpense: Expense = {
      ...expenseData,
      id,
    };

    setExpenses((prev) => [newExpense, ...prev]);

    // Update the card's currentSpend automatically
    setPaymentMethods((prev) =>
      prev.map((card) => {
        if (card.id === newExpense.paymentMethodId) {
          const updatedSpend = card.currentSpend + newExpense.amount;
          return {
            ...card,
            currentSpend: Number(updatedSpend.toFixed(2)),
          };
        }
        return card;
      })
    );

    showToast(`Logged $${newExpense.amount.toFixed(2)} at ${newExpense.merchant}!`);
    return newExpense;
  };

  // Delete Expense
  const deleteExpense = (id: string) => {
    const target = expenses.find((e) => e.id === id);
    if (!target) return;

    setExpenses((prev) => prev.filter((e) => e.id !== id));

    // Refund card spend
    setPaymentMethods((prev) =>
      prev.map((card) => {
        if (card.id === target.paymentMethodId) {
          return {
            ...card,
            currentSpend: Math.max(0, Number((card.currentSpend - target.amount).toFixed(2))),
          };
        }
        return card;
      })
    );

    showToast(`Removed transaction: ${target.merchant}`, 'delete');
  };

  // Clear all logged expenses by month (e.g. "Oct 2024") and refund card spend
  const clearExpensesByMonth = (targetMonth?: string) => {
    const monthToClear = targetMonth || selectedMonth; // e.g. "Oct 2024"
    const parts = monthToClear.trim().split(/\s+/);
    const monName = parts[0] || ''; // "Oct"
    const yr = parts[1] || ''; // "2024"

    const toRemove: Expense[] = [];
    const toKeep: Expense[] = [];

    expenses.forEach((e) => {
      let matches = false;
      if (e.date && e.date.toLowerCase().includes(monName.toLowerCase())) {
        if (!yr || e.date.includes(yr)) {
          matches = true;
        }
      }
      if (!matches && e.isoDate && yr) {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const mIdx = monthNames.findIndex((m) => m.toLowerCase() === monName.toLowerCase());
        if (mIdx >= 0) {
          const mm = String(mIdx + 1).padStart(2, '0');
          if (e.isoDate.startsWith(`${yr}-${mm}`)) {
            matches = true;
          }
        }
      }

      if (matches) {
        toRemove.push(e);
      } else {
        toKeep.push(e);
      }
    });

    if (toRemove.length === 0) {
      showToast(`No logged expenses found for ${monthToClear}.`, 'info');
      return;
    }

    // Refund spend for affected cards
    const refundByCard: Record<string, number> = {};
    toRemove.forEach((exp) => {
      refundByCard[exp.paymentMethodId] = (refundByCard[exp.paymentMethodId] || 0) + exp.amount;
    });

    setExpenses(toKeep);

    setPaymentMethods((prev) =>
      prev.map((card) => {
        const refund = refundByCard[card.id] || 0;
        if (refund > 0) {
          return {
            ...card,
            currentSpend: Math.max(0, Number((card.currentSpend - refund).toFixed(2))),
          };
        }
        return card;
      })
    );

    showToast(`Cleared all ${toRemove.length} expenses for ${monthToClear}!`, 'delete_sweep');
  };

  // Payment Methods operations
  const addPaymentMethod = (method: Omit<CardMethod, 'id'>) => {
    const id = `card-${Date.now()}`;
    const newMethod: CardMethod = {
      ...method,
      id,
    };
    setPaymentMethods((prev) => [...prev, newMethod]);
    showToast(`Added ${newMethod.name} to Household!`, 'add_card');
  };

  const updatePaymentMethod = (id: string, updates: Partial<CardMethod>) => {
    setPaymentMethods((prev) =>
      prev.map((card) => (card.id === id ? { ...card, ...updates } : card))
    );
    showToast(`Configuration updated.`);
  };

  const deletePaymentMethod = (id: string) => {
    setPaymentMethods((prev) => prev.filter((card) => card.id !== id));
    showToast(`Payment method archived.`, 'delete');
  };

  const setDefaultPayerMethod = (id: string) => {
    setPaymentMethods((prev) =>
      prev.map((card) => ({
        ...card,
        isDefaultPayer: card.id === id,
      }))
    );
    const chosen = paymentMethods.find((c) => c.id === id);
    showToast(`${chosen?.name || 'Method'} set as Default Household Payer!`, 'star');
  };

  // Dynamic Settlement computation across all dynamic members
  const netBalances = useMemo(() => {
    const memberPaid: Record<string, number> = {};
    const memberConsumed: Record<string, number> = {};
    const memberNets: Record<string, number> = {};

    members.forEach((m) => {
      memberPaid[m.id] = 0;
      memberConsumed[m.id] = 0;
      memberNets[m.id] = 0;
    });

    let totalMonthSpend = 0;
    let totalActiveTransactions = 0;

    expenses.forEach((e) => {
      if (e.settled) return;
      totalActiveTransactions += 1;
      totalMonthSpend += e.amount;

      if (memberPaid[e.payerId] !== undefined) {
        memberPaid[e.payerId] += e.amount;
      }

      Object.entries(e.splitBreakdown).forEach(([mId, share]) => {
        if (memberConsumed[mId] !== undefined) {
          memberConsumed[mId] += share;
        }
      });
    });

    members.forEach((m) => {
      memberNets[m.id] = Number(((memberPaid[m.id] || 0) - (memberConsumed[m.id] || 0)).toFixed(2));
    });

    // Generate directed debts (who owes whom)
    const debts: { from: string; fromName: string; to: string; toName: string; amount: number }[] = [];

    // Separate debtors (< 0) and creditors (> 0)
    const debtors = members
      .filter((m) => memberNets[m.id] < -0.005)
      .map((m) => ({ id: m.id, name: m.name, debt: Math.abs(memberNets[m.id]) }));

    const creditors = members
      .filter((m) => memberNets[m.id] > 0.005)
      .map((m) => ({ id: m.id, name: m.name, credit: memberNets[m.id] }));

    // Greedy bilateral matching
    let dIdx = 0;
    let cIdx = 0;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx];
      const creditor = creditors[cIdx];
      const settleAmt = Math.min(debtor.debt, creditor.credit);

      if (settleAmt > 0.01) {
        debts.push({
          from: debtor.id,
          fromName: debtor.name,
          to: creditor.id,
          toName: creditor.name,
          amount: Number(settleAmt.toFixed(2)),
        });
      }

      debtor.debt -= settleAmt;
      creditor.credit -= settleAmt;

      if (debtor.debt <= 0.01) dIdx++;
      if (creditor.credit <= 0.01) cIdx++;
    }

    return {
      memberNets,
      debts,
      totalMonthSpend: Number(totalMonthSpend.toFixed(2)),
      totalActiveTransactions,
    };
  }, [expenses, members]);

  const markAllSettled = () => {
    setExpenses((prev) => prev.map((e) => ({ ...e, settled: true })));
    showToast('All household balances marked as SETTLED!', 'check_circle');
  };

  const markDebtSettled = (fromMemberId: string, toMemberId: string) => {
    setExpenses((prev) =>
      prev.map((e) => {
        if (
          (e.payerId === toMemberId && (e.splitBreakdown[fromMemberId] || 0) > 0) ||
          (e.payerId === fromMemberId && (e.splitBreakdown[toMemberId] || 0) > 0)
        ) {
          return { ...e, settled: true };
        }
        return e;
      })
    );
    const fromM = members.find((m) => m.id === fromMemberId)?.name || fromMemberId;
    const toM = members.find((m) => m.id === toMemberId)?.name || toMemberId;
    showToast(`Settled balance between ${fromM} and ${toM}.`, 'verified');
  };

  // SMART CARD RECOMMENDER: Pulls dynamically from the user's added payment methods!
  const recommendBestCard = (merchant: string, mcc?: string, amount = 100): RecommendationResult | null => {
    const result = executeRecommendCard(paymentMethods, merchant, amount);
    if (!result || result.error || !result.topRecommendation) {
      return null;
    }

    const top = result.topRecommendation;
    return {
      card: top.card,
      score: top.score,
      rateLabel: top.card.bonusRate,
      isEligible: top.isEligible,
      reasons: top.reasons,
      warning: top.warning,
      eligibleBlocksAmount: top.eligibleBlocksAmount,
      potentialEarnings: top.potentialEarnings,
      remainingHeadroom: top.remainingHeadroom,
    };
  };

  const syncData = () => {
    showToast('Recalculating spend caps from user payment methods...', 'autorenew');
  };

  const resetAllData = () => {
    localStorage.removeItem(STORAGE_KEY_MEMBERS);
    localStorage.removeItem(STORAGE_KEY_METHODS);
    localStorage.removeItem(STORAGE_KEY_EXPENSES);
    setMembers(INITIAL_MEMBERS);
    setPaymentMethods(INITIAL_PAYMENT_METHODS);
    setExpenses(INITIAL_EXPENSES);
    showToast('Reset to default household state.');
  };

  const resetToDefaultMethods = () => {
    setPaymentMethods(INITIAL_PAYMENT_METHODS);
    try {
      localStorage.setItem(STORAGE_KEY_METHODS, JSON.stringify(INITIAL_PAYMENT_METHODS));
    } catch {
      // ignore
    }
    showToast('Restored default 11 Singapore payment methods!', 'restart_alt');
  };

  return (
    <AppContext.Provider
      value={{
        activeTab,
        setActiveTab,
        selectedMonth,
        setSelectedMonth,
        members,
        addMember,
        updateMember,
        deleteMember,
        setLeadMember,
        paymentMethods,
        expenses,
        toast,
        showToast,
        addExpense,
        deleteExpense,
        clearExpensesByMonth,
        addPaymentMethod,
        updatePaymentMethod,
        deletePaymentMethod,
        setDefaultPayerMethod,
        markAllSettled,
        markDebtSettled,
        calculateSplit,
        calculateCardEligibility,
        recommendBestCard,
        netBalances,
        syncData,
        resetAllData,
        resetToDefaultMethods,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
