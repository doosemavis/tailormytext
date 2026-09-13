import { useState, useEffect, useMemo, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import { Plus, Pencil, Trash2, Check, ChevronDown, ChevronUp, Save, ArrowUpDown } from "lucide-react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useToast } from "../../components/Toast";
import { supabase } from "../../utils/supabase";

// Status presentation. Saturated colors paired with white text and a
// subtle inset highlight so the badges read as actionable pills, not
// wishy-washy tags. Order here drives the Select picker's option order.
const STATUSES = [
  { value: "planned",     label: "Planned",     color: "#64748B" },
  { value: "in_progress", label: "In Progress", color: "#2563EB" },
  { value: "beta",        label: "Beta",        color: "#9333EA" },
  { value: "shipped",     label: "Shipped",     color: "#059669" },
];

const STATUS_BY_VALUE = Object.fromEntries(STATUSES.map(s => [s.value, s]));

function StatusBadge({ value }) {
  const s = STATUS_BY_VALUE[value] || STATUSES[0];
  return (
    <span style={{
      padding: "4px 10px", borderRadius: 999,
      background: s.color, color: "#fff", border: "none",
      fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
      whiteSpace: "nowrap",
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 2px ${s.color}66`,
    }}>{s.label}</span>
  );
}

const EMPTY_DRAFT = { title: "", description: "", status: "planned", category: "", eta: "", sort_order: 0 };

// Shared grid template for header + body rows so columns line up.
const GRID_ROW_STYLE = {
  display: "grid",
  gridTemplateColumns: "70px 2fr 1fr 1fr 110px 110px",
  gap: 12,
  padding: "12px 16px",
  alignItems: "center",
};

function iconBtnStyle(t) {
  return {
    width: 28, height: 28, borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center",
    background: "transparent", border: `1px solid ${t.border}`, color: t.fg, cursor: "pointer", padding: 0,
  };
}

function inputStyle(t) {
  return {
    width: "100%", boxSizing: "border-box",
    padding: "8px 12px", borderRadius: 8, border: `1px solid ${t.border}`,
    background: t.bg, color: t.fg, fontSize: 13, outline: "none",
    fontFamily: "'DM Sans', sans-serif",
  };
}

const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9998,
};

function dialogStyle(t) {
  return {
    position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
    background: t.bg, color: t.fg, border: `1px solid ${t.border}`,
    borderRadius: 14, padding: 24, width: "92vw", maxWidth: 540, maxHeight: "90vh", overflowY: "auto",
    zIndex: 9999, fontFamily: "'DM Sans', sans-serif",
    boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
  };
}

function FormField({ label, t, children }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 650, color: t.fgSoft, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  );
}

function StatusSelect({ value, onChange, t }) {
  const current = STATUS_BY_VALUE[value] || STATUSES[0];
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger style={{ ...inputStyle(t), display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left", cursor: "pointer", padding: "8px 12px" }}>
        <Select.Value>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: current.color }} />
            {current.label}
          </span>
        </Select.Value>
        <Select.Icon>
          <ChevronDown size={14} style={{ color: t.fgSoft }} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 10000 }}>
          <Select.Viewport>
            {STATUSES.map(s => (
              <Select.Item key={s.value} value={s.value} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, fontSize: 13, color: t.fg, cursor: "pointer", outline: "none", userSelect: "none" }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color }} />
                <Select.ItemText>{s.label}</Select.ItemText>
                <Select.ItemIndicator style={{ marginLeft: "auto" }}>
                  <Check size={12} style={{ color: t.accent }} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export default function RoadmapTab({ t }) {
  const { showToast } = useToast();

  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  // null = closed; "new" = create; an item object = edit
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [confirmingDelete, setConfirmingDelete] = useState(null);
  const [sorting, setSorting] = useState([{ id: "sort_order", desc: false }]);

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from("roadmap_items")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      showToast(`Failed to load roadmap: ${error.message}`, "error");
      setLoaded(true);
      return;
    }
    setItems(data || []);
    setLoaded(true);
  }, [showToast]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openNew = () => {
    const maxSort = items.reduce((m, it) => Math.max(m, it.sort_order), -1);
    setDraft({ ...EMPTY_DRAFT, sort_order: maxSort + 1 });
    setEditing("new");
  };

  const openEdit = (item) => {
    setDraft({
      title: item.title || "",
      description: item.description || "",
      status: item.status || "planned",
      category: item.category || "",
      eta: item.eta || "",
      sort_order: item.sort_order ?? 0,
    });
    setEditing(item);
  };

  const closeDialog = () => {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
  };

  const handleSave = async () => {
    const title = draft.title.trim();
    if (!title) {
      showToast("Title is required.", "error");
      return;
    }
    setBusy(true);
    const payload = {
      title,
      description: draft.description.trim() || null,
      status: draft.status,
      category: draft.category.trim() || null,
      eta: draft.eta.trim() || null,
      sort_order: Number.isFinite(+draft.sort_order) ? +draft.sort_order : 0,
    };
    if (editing === "new") {
      const { error } = await supabase.from("roadmap_items").insert(payload);
      setBusy(false);
      if (error) {
        showToast(`Insert failed: ${error.message}`, "error");
        return;
      }
      showToast("Improvement added.", "success");
    } else {
      const { error } = await supabase.from("roadmap_items").update(payload).eq("id", editing.id);
      setBusy(false);
      if (error) {
        showToast(`Update failed: ${error.message}`, "error");
        return;
      }
      showToast("Improvement updated.", "success");
    }
    closeDialog();
    fetchItems();
  };

  const handleDelete = async (id) => {
    setBusy(true);
    const { error } = await supabase.from("roadmap_items").delete().eq("id", id);
    setBusy(false);
    setConfirmingDelete(null);
    if (error) {
      showToast(`Delete failed: ${error.message}`, "error");
      return;
    }
    showToast("Improvement removed.", "success");
    fetchItems();
  };

  const columns = useMemo(() => {
    const ch = createColumnHelper();
    return [
      ch.accessor("sort_order", {
        header: "Sort",
        cell: (info) => (
          <span style={{ color: t.fgSoft, fontSize: 12, fontWeight: 600 }}>{info.getValue()}</span>
        ),
        size: 70,
      }),
      ch.accessor("title", {
        header: "Title",
        cell: (info) => {
          const row = info.row.original;
          return (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.fg, marginBottom: 2 }}>{row.title}</div>
              {row.description && (
                <div style={{ fontSize: 12, color: t.fgSoft, lineHeight: 1.5 }}>{row.description}</div>
              )}
            </div>
          );
        },
      }),
      ch.accessor("category", {
        header: "Category",
        cell: (info) => <span style={{ fontSize: 12, color: t.fgSoft }}>{info.getValue() || "—"}</span>,
      }),
      ch.accessor("eta", {
        header: "ETA",
        cell: (info) => <span style={{ fontSize: 12, color: t.fgSoft }}>{info.getValue() || "—"}</span>,
      }),
      ch.accessor("status", {
        header: "Status",
        cell: (info) => <StatusBadge value={info.getValue()} />,
        size: 110,
      }),
      ch.display({
        id: "actions",
        header: () => <span style={{ display: "block", textAlign: "right" }}>Actions</span>,
        enableSorting: false,
        cell: (info) => {
          const item = info.row.original;
          return (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
              <button onClick={() => openEdit(item)} title="Edit" style={iconBtnStyle(t)}>
                <Pencil size={13} />
              </button>
              <button onClick={() => setConfirmingDelete(item.id)} title="Delete" style={{ ...iconBtnStyle(t), color: "#E25C5C" }}>
                <Trash2 size={13} />
              </button>
            </div>
          );
        },
        size: 110,
      }),
    ];
  }, [t]);

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <div style={{ padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <p style={{ fontSize: 12, color: t.fgSoft, margin: 0, lineHeight: 1.5, maxWidth: 520 }}>
          Improvements in flight or queued. Public roadmap page coming later.
        </p>
        <button
          onClick={openNew}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 8, background: t.accent, color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
        >
          <Plus size={14} /> Add improvement
        </button>
      </div>

      {!loaded ? (
        <p style={{ color: t.fgSoft }}>Loading roadmap…</p>
      ) : items.length === 0 ? (
        <div style={{ padding: "40px 16px", textAlign: "center", borderRadius: 12, background: t.surface, color: t.fgSoft, fontSize: 13 }}>
          No improvements yet — click <strong style={{ color: t.fg }}>Add improvement</strong> to create the first one.
        </div>
      ) : (
        <div style={{ borderRadius: 12, background: t.surface, overflow: "hidden", border: `1px solid ${t.border}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", display: "block" }}>
            <thead style={{ display: "block", background: t.surfaceHover, borderBottom: `1px solid ${t.border}` }}>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} style={GRID_ROW_STYLE}>
                  {hg.headers.map((header) => {
                    const sortable = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                        style={{
                          fontSize: 10, fontWeight: 700, color: t.fgSoft, letterSpacing: "0.06em",
                          textTransform: "uppercase", textAlign: "left", padding: 0,
                          cursor: sortable ? "pointer" : "default", userSelect: "none",
                          display: "flex", alignItems: "center", gap: 4,
                        }}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sortable && (
                          sorted === "asc" ? <ChevronUp size={11} /> :
                          sorted === "desc" ? <ChevronDown size={11} /> :
                          <ArrowUpDown size={11} style={{ opacity: 0.4 }} />
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody style={{ display: "block" }}>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} style={{ ...GRID_ROW_STYLE, borderBottom: `1px solid ${t.borderSoft}`, padding: "14px 16px" }}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} style={{ display: "flex", alignItems: "center", padding: 0 }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add/Edit dialog ────────────────────────────────────────── */}
      <Dialog.Root open={editing != null} onOpenChange={(o) => !o && closeDialog()}>
        <Dialog.Portal>
          <Dialog.Overlay style={overlayStyle} />
          <Dialog.Content style={dialogStyle(t)}>
            <Dialog.Title style={{ fontSize: 18, fontWeight: 740, margin: "0 0 4px", color: t.fg }}>
              {editing === "new" ? "Add improvement" : "Edit improvement"}
            </Dialog.Title>
            <Dialog.Description style={{ fontSize: 12, color: t.fgSoft, margin: "0 0 20px" }}>
              {editing === "new" ? "Create a new roadmap entry." : "Update the existing entry."}
            </Dialog.Description>

            <FormField label="Title" t={t}>
              <input
                value={draft.title}
                onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                maxLength={200}
                style={inputStyle(t)}
                autoFocus
              />
            </FormField>

            <FormField label="Description" t={t}>
              <textarea
                value={draft.description}
                onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                maxLength={2000}
                rows={3}
                style={{ ...inputStyle(t), resize: "vertical", fontFamily: "inherit" }}
              />
            </FormField>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FormField label="Status" t={t}>
                <StatusSelect value={draft.status} onChange={(v) => setDraft(d => ({ ...d, status: v }))} t={t} />
              </FormField>
              <FormField label="Sort order" t={t}>
                <input
                  type="number"
                  value={draft.sort_order}
                  onChange={e => setDraft(d => ({ ...d, sort_order: e.target.value }))}
                  style={inputStyle(t)}
                />
              </FormField>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FormField label="Category" t={t}>
                <input
                  value={draft.category}
                  onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
                  maxLength={80}
                  placeholder="PDF parsing, Reading guide…"
                  style={inputStyle(t)}
                />
              </FormField>
              <FormField label="ETA" t={t}>
                <input
                  value={draft.eta}
                  onChange={e => setDraft(d => ({ ...d, eta: e.target.value }))}
                  maxLength={60}
                  placeholder="Q3 2026, next sprint…"
                  style={inputStyle(t)}
                />
              </FormField>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <Dialog.Close asChild>
                <button style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.fg, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={handleSave}
                disabled={busy}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 8, border: "none", background: t.accent, color: "#fff", fontWeight: 700, fontSize: 13, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1, fontFamily: "'DM Sans', sans-serif" }}
              >
                <Save size={13} /> {editing === "new" ? "Create" : "Save"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Delete confirm dialog ──────────────────────────────────── */}
      <Dialog.Root open={confirmingDelete != null} onOpenChange={(o) => !o && setConfirmingDelete(null)}>
        <Dialog.Portal>
          <Dialog.Overlay style={overlayStyle} />
          <Dialog.Content style={{ ...dialogStyle(t), maxWidth: 400 }}>
            <Dialog.Title style={{ fontSize: 16, fontWeight: 740, margin: "0 0 8px", color: t.fg }}>Delete improvement?</Dialog.Title>
            <Dialog.Description style={{ fontSize: 13, color: t.fgSoft, margin: "0 0 20px" }}>
              This permanently removes the entry. Cannot be undone.
            </Dialog.Description>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Dialog.Close asChild>
                <button style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.fg, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  Cancel
                </button>
              </Dialog.Close>
              <button
                onClick={() => handleDelete(confirmingDelete)}
                disabled={busy}
                style={{ padding: "9px 14px", borderRadius: 8, border: "none", background: "#E25C5C", color: "#fff", fontWeight: 700, fontSize: 13, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1, fontFamily: "'DM Sans', sans-serif" }}
              >
                Delete
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
