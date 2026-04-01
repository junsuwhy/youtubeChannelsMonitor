import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getUsers, createUser, updateUser } from "../lib/api";
import type { UserResponse } from "../lib/api";

const ROLE_LABELS: Record<string, string> = {
  user_admin: "使用者管理員",
  content_admin: "內容管理員",
  viewer: "一般使用者",
};

const ROLE_COLORS: Record<string, string> = {
  user_admin: "bg-red-100 text-red-700",
  content_admin: "bg-blue-100 text-blue-700",
  viewer: "bg-zinc-100 text-zinc-600",
};

export default function UsersPage() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: getUsers,
  });
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<UserResponse | null>(null);

  const [createForm, setCreateForm] = useState({
    username: "", password: "", email: "", role: "viewer"
  });

  const [editForm, setEditForm] = useState({
    email: "", role: "viewer", is_active: true, password: ""
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setShowCreate(false);
      setCreateForm({ username: "", password: "", email: "", role: "viewer" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateUser>[1] }) => updateUser(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setEditUser(null);
    },
  });

  if (isLoading) return <div>載入中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">使用者管理</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-zinc-900 text-white rounded-md text-sm hover:bg-zinc-700"
        >
          新增使用者
        </button>
      </div>

      <div className="border rounded-lg overflow-hidden bg-white dark:bg-zinc-950">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium">使用者名稱</th>
              <th className="px-4 py-3 text-left font-medium">Email</th>
              <th className="px-4 py-3 text-left font-medium">角色</th>
              <th className="px-4 py-3 text-left font-medium">狀態</th>
              <th className="px-4 py-3 text-left font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
                <td className="px-4 py-3">{u.username}</td>
                <td className="px-4 py-3 text-zinc-500">{u.email ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[u.role]}`}>
                    {ROLE_LABELS[u.role]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={u.is_active ? "text-green-600" : "text-zinc-400"}>
                    {u.is_active ? "啟用" : "停用"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => {
                      setEditUser(u);
                      setEditForm({ email: u.email ?? "", role: u.role, is_active: u.is_active, password: "" });
                    }}
                    className="text-zinc-600 hover:text-zinc-900 text-xs underline mr-3"
                  >
                    編輯
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-950 rounded-lg p-6 w-96 space-y-4 shadow-xl">
            <h3 className="font-semibold text-lg">新增使用者</h3>
            {(["username", "password", "email"] as const).map((field) => (
              <div key={field}>
                <label className="block text-sm font-medium mb-1">
                  {field === "username" ? "使用者名稱" : field === "password" ? "密碼" : "Email（選填）"}
                </label>
                <input
                  type={field === "password" ? "password" : "text"}
                  value={createForm[field]}
                  onChange={(e) => setCreateForm((f) => ({ ...f, [field]: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium mb-1">角色</label>
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="viewer">一般使用者</option>
                <option value="content_admin">內容管理員</option>
                <option value="user_admin">使用者管理員</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border rounded">取消</button>
              <button
                onClick={() => createMutation.mutate({ ...createForm, email: createForm.email || undefined })}
                className="px-4 py-2 text-sm bg-zinc-900 text-white rounded"
              >
                建立
              </button>
            </div>
          </div>
        </div>
      )}

      {editUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-950 rounded-lg p-6 w-96 space-y-4 shadow-xl">
            <h3 className="font-semibold text-lg">編輯 {editUser.username}</h3>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="text"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">角色</label>
              <select
                value={editForm.role}
                onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="viewer">一般使用者</option>
                <option value="content_admin">內容管理員</option>
                <option value="user_admin">使用者管理員</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">新密碼（留空則不變）</label>
              <input
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editForm.is_active}
                onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))}
                id="is_active"
              />
              <label htmlFor="is_active" className="text-sm">啟用帳號</label>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditUser(null)} className="px-4 py-2 text-sm border rounded">取消</button>
              <button
                onClick={() => {
                  const updates: Parameters<typeof updateUser>[1] = { role: editForm.role, is_active: editForm.is_active };
                  if (editForm.email) updates.email = editForm.email;
                  if (editForm.password) updates.password = editForm.password;
                  updateMutation.mutate({ id: editUser.id, data: updates });
                }}
                className="px-4 py-2 text-sm bg-zinc-900 text-white rounded"
              >
                儲存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
