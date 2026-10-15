import { useCallback, useEffect, useRef, useState } from "react";
import type { Conversation } from "@primerai/shared";
import {
  ChevronDown,
  Ellipsis,
  HatGlasses,
  Laptop,
  PanelLeft,
  Pencil,
  Pin,
  PinOff,
  Search,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import type { Session } from "../lib/api";
import logo from "../assets/logo.png";

export type AccountAnchor = {
  left: number;
  top: number;
  width: number;
};

type ConversationMenuAnchor = {
  conversationId: string;
  left: number;
  top: number;
  width: number;
};

type SidebarProps = {
  conversations: Conversation[];
  activeConversation: string | null;
  anonymous: boolean;
  session: Session | null;
  accountMenuOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onNewChat: () => void;
  onToggleAnonymous: () => void;
  onSearch: () => void;
  onRemote: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (conversation: Conversation) => void;
  onTogglePin: (conversation: Conversation) => void;
  onRenameConversation: (conversation: Conversation) => void;
  onAccountClick: (anchor: AccountAnchor) => void;
  pinnedIds: string[];
};

const navItemClass =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border border-transparent bg-transparent px-2.5 py-[0.5rem] text-left text-[0.875rem] text-[var(--muted)] transition-colors hover:border-transparent hover:bg-[var(--surface-2)] hover:text-[var(--text)]";

const menuItemClass =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-[9px] border border-transparent bg-transparent px-2.5 py-[0.55rem] text-left text-[0.875rem] transition-colors";

const CONVERSATION_PAGE_SIZE = 30;

export function Sidebar({
  conversations,
  activeConversation,
  anonymous,
  session,
  accountMenuOpen,
  onOpenChange,
  onNewChat,
  onToggleAnonymous,
  onSearch,
  onRemote,
  onSelectConversation,
  onDeleteConversation,
  onTogglePin,
  onRenameConversation,
  onAccountClick,
  pinnedIds,
}: SidebarProps) {
  const [closed, setClosed] = useState(false);
  const [hover, setHover] = useState(false);
  const [conversationMenu, setConversationMenu] =
    useState<ConversationMenuAnchor | null>(null);
  const [visibleCount, setVisibleCount] = useState(CONVERSATION_PAGE_SIZE);
  const hoverTimer = useRef<number | undefined>(undefined);
  const lastClose = useRef(0);

  const open = !closed || hover;

  const activeIndex = conversations.findIndex(
    (item) => item.id === activeConversation,
  );
  const limit = Math.max(visibleCount, activeIndex + 1);
  const visibleConversations = conversations.slice(0, limit);
  const hasMore = conversations.length > visibleConversations.length;

  useEffect(() => {
    onOpenChange(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) setConversationMenu(null);
  }, [open]);

  const openOnHover = useCallback(() => {
    window.clearTimeout(hoverTimer.current);
    if (Date.now() - lastClose.current < 800) return;
    hoverTimer.current = window.setTimeout(() => setHover(true), 350);
  }, []);

  const closeHover = useCallback(() => {
    window.clearTimeout(hoverTimer.current);
    setHover(false);
  }, []);

  const toggle = useCallback(() => {
    setClosed((wasClosed) => {
      if (wasClosed) return false;
      lastClose.current = Date.now();
      return true;
    });
    setHover(false);
  }, []);

  const menuConversation = conversationMenu
    ? conversations.find((item) => item.id === conversationMenu.conversationId)
    : undefined;
  const menuPinned = menuConversation
    ? pinnedIds.includes(menuConversation.id)
    : false;

  return (
    <>
      {!open && (
        <button
          type="button"
          className="fixed top-3 left-3 z-20 inline-flex cursor-pointer items-center rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-[0.45rem] text-[var(--muted)] hover:border-[var(--border)] hover:text-[var(--text)]"
          aria-label="Abrir sidebar"
          onClick={() => {
            window.clearTimeout(hoverTimer.current);
            setHover(false);
            setClosed(false);
          }}
          onMouseEnter={openOnHover}
          onMouseLeave={() => window.clearTimeout(hoverTimer.current)}
        >
          <PanelLeft size={18} aria-hidden="true" />
        </button>
      )}

      <aside
        className={`flex min-h-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[#0a0c11] px-2.5 pt-3.5 pb-2.5 max-[700px]:px-2 ${open ? "" : "hidden"}`}
        onMouseEnter={() => window.clearTimeout(hoverTimer.current)}
        onMouseLeave={closeHover}
      >
        <div className="flex items-center justify-between px-1 pb-4">
          <span className="flex items-center gap-2.5">
            <img
              src={logo}
              alt=""
              className="h-7 w-7 object-contain invert"
              aria-hidden="true"
            />
            <strong className="text-[1rem] font-semibold tracking-[-0.01em] text-[var(--text)]">
              PrimerAI
            </strong>
          </span>
          <button
            type="button"
            className="grid h-7 w-7 cursor-pointer place-items-center rounded-[9px] border border-transparent bg-transparent p-0 text-[var(--muted)] transition-colors hover:border-transparent hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            aria-label="Fechar sidebar"
            onClick={toggle}
          >
            <PanelLeft size={16} aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          className="mb-1 flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border border-[rgba(111,140,255,0.32)] bg-[rgba(111,140,255,0.10)] px-2.5 py-[0.55rem] text-left text-[0.875rem] font-medium text-[#9db1ff] transition-colors hover:border-[rgba(111,140,255,0.55)] hover:bg-[rgba(111,140,255,0.16)]"
          onClick={onNewChat}
        >
          <SquarePen size={16} aria-hidden="true" /> Novo chat
        </button>

        <button
          type="button"
          className={`${navItemClass}${anonymous ? " border-[rgba(224,108,117,0.35)] bg-[rgba(224,108,117,0.10)] text-[#e06c75] hover:bg-[rgba(224,108,117,0.16)]" : ""}`}
          aria-pressed={anonymous}
          title={
            anonymous
              ? "Esta conversa não é salva no histórico"
              : "Conversa sem salvar no histórico"
          }
          onClick={onToggleAnonymous}
        >
          {anonymous ? (
            <X size={16} aria-hidden="true" />
          ) : (
            <HatGlasses size={16} aria-hidden="true" />
          )}
          {anonymous ? "Sair da conversa anônima" : "Conversa anônima"}
        </button>

        <button type="button" className={navItemClass} onClick={onSearch}>
          <Search size={16} aria-hidden="true" /> Buscar conversas
        </button>

        <button type="button" className={navItemClass} onClick={onRemote}>
          <Laptop size={16} aria-hidden="true" /> Remote
        </button>

        <p className="m-0 px-2.5 pt-5 pb-1.5 text-[0.7rem] font-semibold tracking-[0.09em] text-[var(--muted)] uppercase">
          Histórico
        </p>

        <nav
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-0.5"
          aria-label="Histórico de conversas"
        >
          {visibleConversations.map((conversation) => {
            const active = activeConversation === conversation.id;
            const pinned = pinnedIds.includes(conversation.id);
            const menuOpen =
              conversationMenu?.conversationId === conversation.id;
            return (
              <div
                key={conversation.id}
                className={`group flex items-center rounded-[10px] border transition-colors ${
                  active
                    ? "border-[var(--border)] bg-[var(--surface-2)]"
                    : "border-transparent hover:bg-[rgba(255,255,255,0.045)]"
                }`}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 overflow-hidden border-transparent bg-transparent px-2.5 py-[0.6rem] text-left text-[0.875rem] text-[var(--text)] transition-colors hover:border-transparent"
                  onClick={() => {
                    setConversationMenu(null);
                    onSelectConversation(conversation.id);
                  }}
                >
                  {pinned && (
                    <Pin
                      size={13}
                      className="shrink-0 text-[var(--accent)]"
                      aria-label="Conversa fixada"
                    />
                  )}
                  <span className="truncate whitespace-nowrap">
                    {conversation.title}
                  </span>
                </button>
                <button
                  type="button"
                  className={`mr-1.5 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[9px] border border-transparent bg-transparent p-0 text-[var(--muted)] transition-all hover:border-transparent hover:bg-[var(--surface)] hover:text-[var(--text)] focus-visible:opacity-100 ${
                    menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                  aria-label={`Opções de ${conversation.title}`}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  title="Opções da conversa"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (menuOpen) {
                      setConversationMenu(null);
                      return;
                    }
                    const row = event.currentTarget.parentElement;
                    const rect =
                      row?.getBoundingClientRect() ??
                      event.currentTarget.getBoundingClientRect();
                    setConversationMenu({
                      conversationId: conversation.id,
                      left: rect.left,
                      top: rect.bottom + 6,
                      width: rect.width,
                    });
                  }}
                >
                  <Ellipsis size={17} aria-hidden="true" />
                </button>
              </div>
            );
          })}
          {hasMore && (
            <button
              type="button"
              className="mt-1 flex w-full cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-[var(--border)] bg-transparent px-2.5 py-[0.5rem] text-[0.8rem] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              onClick={() =>
                setVisibleCount((count) => count + CONVERSATION_PAGE_SIZE)
              }
            >
              <ChevronDown size={14} aria-hidden="true" />
              Ver mais conversas
              <span className="text-[0.72rem] font-normal text-[var(--muted)]">
                ({conversations.length - visibleConversations.length})
              </span>
            </button>
          )}
          {conversations.length === 0 && (
            <span className="px-2.5 py-2 text-[0.85rem] text-[var(--muted)]">
              Seus chats aparecerão aqui.
            </span>
          )}
        </nav>

        <div className="mt-auto flex flex-col border-t border-[var(--border)] pt-2">
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border border-transparent bg-transparent px-1.5 py-1.5 text-left transition-colors hover:border-[var(--border)] hover:bg-[var(--surface-2)]"
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              onAccountClick({
                left: rect.left,
                top: rect.top,
                width: rect.width,
              });
            }}
          >
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#6f8cff,#a06bff)] text-[0.8rem] font-semibold text-[#0d0f14]"
              aria-hidden="true"
            >
              {(
                session?.user.name?.trim()?.[0] ??
                session?.user.email?.[0] ??
                "?"
              ).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-[0.8rem] text-[var(--muted)]">
              {session?.user.name?.trim() || session?.user.email}
            </span>
          </button>
        </div>
      </aside>

      {conversationMenu && (
        <>
          <div
            className="fixed inset-0 z-20"
            role="presentation"
            onMouseDown={() => setConversationMenu(null)}
          />
          <div
            className="fixed z-30 min-w-[190px] overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[0_18px_44px_rgb(0_0_0_/_55%)]"
            role="menu"
            aria-label="Opções da conversa"
            style={{
              left: conversationMenu.left,
              top: conversationMenu.top,
              width: Math.max(conversationMenu.width, 190),
            }}
          >
            <button
              type="button"
              role="menuitem"
              className={`${menuItemClass} text-[var(--text)] hover:bg-[var(--surface-2)]`}
              onClick={() => {
                const target = menuConversation;
                setConversationMenu(null);
                if (target) onRenameConversation(target);
              }}
            >
              <Pencil
                size={15}
                className="text-[var(--muted)]"
                aria-hidden="true"
              />
              Renomear
            </button>
            <button
              type="button"
              role="menuitem"
              className={`${menuItemClass} text-[var(--text)] hover:bg-[var(--surface-2)]`}
              onClick={() => {
                const target = menuConversation;
                setConversationMenu(null);
                if (target) onTogglePin(target);
              }}
            >
              {menuPinned ? (
                <PinOff
                  size={15}
                  className="text-[var(--muted)]"
                  aria-hidden="true"
                />
              ) : (
                <Pin
                  size={15}
                  className="text-[var(--muted)]"
                  aria-hidden="true"
                />
              )}
              {menuPinned ? "Desafixar" : "Fixar"}
            </button>

            <div className="mx-2 my-1 h-px bg-[var(--border)]" />

            <button
              type="button"
              role="menuitem"
              className={`${menuItemClass} text-[#e06c75] hover:bg-[rgba(224,108,117,0.12)]`}
              onClick={() => {
                const target = menuConversation;
                setConversationMenu(null);
                if (target) onDeleteConversation(target);
              }}
            >
              <Trash2 size={15} aria-hidden="true" />
              Deletar
            </button>
          </div>
        </>
      )}
    </>
  );
}
