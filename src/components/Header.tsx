import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { TabType } from '../types';

interface HeaderProps {
  onOpenManageMembers?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenManageMembers }) => {
  const { activeTab, setActiveTab, selectedMonth, setSelectedMonth, members, showToast } = useApp();
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const months = ['Sep 2024', 'Oct 2024', 'Nov 2024'];

  const navItems: { id: TabType; label: string; shortLabel: string }[] = [
    { id: 'dashboard', label: 'Dashboard', shortLabel: 'Dash' },
    { id: 'log', label: 'Log Expense & Split', shortLabel: 'Log Expense' },
    { id: 'settle', label: 'Monthly Settle-Up & Balances', shortLabel: 'Settle-Up' },
    { id: 'cards', label: 'SG Card Limits & Strategy', shortLabel: 'Card Caps' },
    { id: 'methods', label: 'Payment Methods', shortLabel: 'Cards & Rails' },
  ];

  const handleMonthSelect = (m: string) => {
    setSelectedMonth(m);
    setShowMonthDropdown(false);
    showToast(`Switched ledger cycle to: ${m}`);
  };

  const leadMember = members.find((m) => m.role === 'lead') || members[0];
  const memberNames = members.map((m) => m.name.split(' ')[0]).join(', ');

  return (
    <header className="h-14 w-full bg-[#FCF9F3]/95 backdrop-blur-sm border-b-2 border-[#264D59] shrink-0 z-40 relative">
      <div className="h-full px-3 md:px-5 flex items-center justify-between gap-2">
        {/* Brand Lockup */}
        <div
          className="flex items-center gap-2.5 shrink-0 cursor-pointer"
          onClick={() => setActiveTab('dashboard')}
          title="Go to Dashboard"
        >
          <div className="w-8 h-8 bg-[#F9E07F] text-[#264D59] border-2 border-[#264D59] flex items-center justify-center font-headline font-extrabold text-sm shadow-[1.5px_1.5px_0px_#264D59]">
            SG
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-headline font-extrabold uppercase tracking-tight text-[#264D59] leading-none">
              SplitStack SG
            </span>
            <span className="text-[9px] font-label font-bold uppercase tracking-wider text-[#264D59]/75 leading-tight">
              Household &amp; SG Card Engine
            </span>
          </div>
        </div>

        {/* Desktop Navigation Tabs */}
        <nav className="hidden lg:flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`text-[11px] font-label uppercase tracking-wider px-2.5 py-1 transition-all ${
                  isActive
                    ? 'bg-[#F9E07F] text-[#264D59] border-2 border-[#264D59] font-bold shadow-[2px_2px_0px_#264D59]'
                    : 'text-[#264D59]/80 hover:text-[#264D59] hover:bg-[#F0EEE8] font-semibold border-2 border-transparent'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Right Info & Actions */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          {/* Month Selector Pill */}
          <div className="relative">
            <button
              onClick={() => setShowMonthDropdown(!showMonthDropdown)}
              className="flex items-center gap-1.5 bg-[#FCF9F3] border-2 border-[#264D59] px-2 md:px-2.5 py-1 shadow-[2px_2px_0px_#264D59] active:translate-x-0.5 active:translate-y-0.5 transition-transform"
            >
              <span className="material-symbols-outlined text-sm text-[#264D59]">calendar_month</span>
              <span className="font-label text-[11px] font-bold uppercase tracking-wide text-[#264D59]">
                {selectedMonth}
              </span>
              <span className="material-symbols-outlined text-xs text-[#264D59]">arrow_drop_down</span>
            </button>

            {showMonthDropdown && (
              <div className="absolute right-0 top-full mt-1 w-32 bg-[#FCF9F3] border-2 border-[#264D59] shadow-[3px_3px_0px_#264D59] z-50 py-1">
                {months.map((m) => (
                  <button
                    key={m}
                    onClick={() => handleMonthSelect(m)}
                    className={`w-full text-left px-3 py-1 text-xs font-headline font-bold uppercase hover:bg-[#F9E07F] text-[#264D59] flex items-center justify-between ${
                      m === selectedMonth ? 'bg-[#F0EEE8]' : ''
                    }`}
                  >
                    <span>{m}</span>
                    {m === selectedMonth && <span className="text-[10px]">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dynamic Household Pill (Clickable to manage members) */}
          <button
            onClick={onOpenManageMembers}
            className="hidden sm:flex flex-col text-right leading-tight bg-[#FCF9F3] hover:bg-[#F9E07F]/30 border border-[#264D59] px-2 py-0.5 transition-colors cursor-pointer"
            title="Manage Household Members"
          >
            <span className="text-[11px] font-headline font-bold text-[#264D59] flex items-center justify-end gap-1">
              <span>Household ({members.length})</span>
              <span className="material-symbols-outlined text-[11px]">edit</span>
            </span>
            <span className="text-[9px] font-body text-[#264D59]/70 truncate max-w-[130px]">
              {memberNames}
            </span>
          </button>

          {/* Profile Avatar / Lead Initial */}
          <button
            onClick={onOpenManageMembers}
            className="border-2 border-[#264D59] rounded-full p-0.5 bg-[#FCF9F3] shrink-0 cursor-pointer shadow-[1px_1px_0px_#264D59] hover:bg-[#F9E07F] transition-colors"
            title={`Lead Payer: ${leadMember?.name} (Click to manage)`}
          >
            <div className="w-6 h-6 rounded-full bg-[#264D59] text-[#F9E07F] font-headline font-bold text-xs flex items-center justify-center">
              {leadMember?.name.substring(0, 2).toUpperCase() || 'SG'}
            </div>
          </button>

          {/* Mobile Navigation Toggle */}
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="lg:hidden p-1 bg-[#FCF9F3] border-2 border-[#264D59] shadow-[1.5px_1.5px_0px_#264D59] text-[#264D59] flex items-center justify-center"
            aria-label="Toggle navigation"
          >
            <span className="material-symbols-outlined text-base">
              {showMobileMenu ? 'close' : 'menu'}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Nav Dropdown Modal / Overlay */}
      {showMobileMenu && (
        <div className="lg:hidden absolute top-full left-0 right-0 bg-[#FCF9F3] border-b-2 border-[#264D59] shadow-[0_4px_12px_rgba(38,77,89,0.25)] p-2 z-50 flex flex-col gap-1.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setShowMobileMenu(false);
              }}
              className={`w-full text-left p-2 font-headline font-bold text-xs uppercase border-2 border-[#264D59] flex items-center justify-between ${
                activeTab === item.id
                  ? 'bg-[#F9E07F] text-[#264D59] shadow-[2px_2px_0px_#264D59]'
                  : 'bg-[#FBF8F2] text-[#264D59]'
              }`}
            >
              <span>{item.label}</span>
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          ))}
          <button
            onClick={() => {
              setShowMobileMenu(false);
              onOpenManageMembers?.();
            }}
            className="w-full text-left p-2 font-headline font-bold text-xs uppercase border-2 border-[#264D59] bg-[#F0EEE8] text-[#264D59] flex items-center justify-between mt-1"
          >
            <span>Manage Household Members ({members.length})</span>
            <span className="material-symbols-outlined text-sm">group</span>
          </button>
        </div>
      )}
    </header>
  );
};
