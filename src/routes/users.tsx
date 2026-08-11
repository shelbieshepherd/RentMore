import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "~/lib/layout";
import { useAuth, type UserRole } from "~/lib/auth";
import { useState } from "react";

export const Route = createFileRoute("/users")({
  component: UsersPage,
});

const roleBadge: Record<UserRole, string> = {
  admin: "bg-purple-100 text-purple-800",
  agent: "bg-blue-100 text-blue-800",
  owner: "bg-amber-100 text-amber-800",
};

function UsersPage() {
  const { user, allUsers } = useAuth();
  const isAdmin = user?.role === "admin";
  const isDbUser = !!user?.companyId;
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("agent");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  // Edit/delete state
  const [editingUser, setEditingUser] = useState<(typeof allUsers)[number] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<(typeof allUsers)[number] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const isEditing = editingUser !== null;
  const adminCount = allUsers.filter(u => u.role === "admin").length;

  if (!isAdmin) {
    return (
      <DashboardLayout currentPath="/users">
        <div className="text-center py-20">
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="text-xl font-bold text-gray-900">Access Denied</h1>
          <p className="text-sm text-gray-500 mt-1">Only administrators can manage users.</p>
        </div>
      </DashboardLayout>
    );
  }

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    if (!isDbUser || !user?.companyId) {
      setAddError("Database not connected. Add users after connecting a database.");
      return;
    }
    setAdding(true);
    try {
      const { insertUser } = await import("~/lib/db-queries");
      await insertUser({ data: {
        companyId: user.companyId,
        email: newEmail,
        password: newPassword,
        name: newName,
        role: newRole,
      }});
      setShowModal(false);
      setNewName(""); setNewEmail(""); setNewPassword("");
      // Refresh handled by reload — simple approach:
      window.location.reload();
    } catch (e: any) {
      if (e?.message === "EMAIL_TAKEN") {
        setAddError("A user with this email already exists in your company.");
      } else {
        // Surface the real error (constraint/driver failures) instead of a
        // generic message that hides e.g. a role CHECK violation.
        setAddError(e?.message || "Failed to add user. Make sure the database is connected.");
      }
    }
    setAdding(false);
  };

  const openEditUser = (u: (typeof allUsers)[number]) => {
    setEditingUser(u);
    setNewName(u.name);
    setNewEmail(u.email);
    setNewRole(u.role as UserRole);
    setNewPassword("");
    setAddError("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setAddError("");
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    if (!isDbUser || !user?.companyId || !editingUser) return;
    setAdding(true);
    try {
      const { updateUser } = await import("~/lib/db-queries");
      await updateUser({ data: {
        companyId: user.companyId,
        id: editingUser.id,
        name: newName,
        email: newEmail,
        role: newRole,
        password: newPassword || undefined, // blank = keep current password
      }});
      closeModal();
      window.location.reload();
    } catch (e: any) {
      if (e?.message === "EMAIL_TAKEN") {
        setAddError("A user with this email already exists in your company.");
      } else {
        setAddError(e?.message || "Failed to update user.");
      }
    }
    setAdding(false);
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget || !isDbUser || !user?.companyId) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const { deleteUser } = await import("~/lib/db-queries");
      await deleteUser({ data: { companyId: user.companyId, id: deleteTarget.id } });
      setDeleteTarget(null);
      window.location.reload();
    } catch (e: any) {
      setDeleteError(e?.message || "Failed to delete user.");
      setDeleting(false);
    }
  };

  return (
    <DashboardLayout currentPath="/users">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="text-sm text-gray-500">{allUsers.length} users across {new Set(allUsers.map(u => u.role)).size} roles</p>
          </div>
          <button className="btn-primary gap-2" onClick={() => setShowModal(true)}>+ Add User</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="card p-4">
            <span className="text-2xl">👑</span>
            <p className="text-lg font-bold">{allUsers.filter(u => u.role === "admin").length}</p>
            <p className="text-xs text-gray-500">Administrators</p>
          </div>
          <div className="card p-4">
            <span className="text-2xl">👤</span>
            <p className="text-lg font-bold">{allUsers.filter(u => u.role === "agent").length}</p>
            <p className="text-xs text-gray-500">Agents</p>
          </div>
          <div className="card p-4">
            <span className="text-2xl">🏠</span>
            <p className="text-lg font-bold">{allUsers.filter(u => u.role === "owner").length}</p>
            <p className="text-xs text-gray-500">Owners</p>
          </div>
        </div>

        <div className="card">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold">All Users</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">User</th>
                  <th className="text-left px-6 py-3 font-medium">Email</th>
                  <th className="text-left px-6 py-3 font-medium">Role</th>
                  <th className="text-left px-6 py-3 font-medium">Source</th>
                  <th className="text-right px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allUsers.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                          {u.name.split(" ").map(n => n[0]).join("")}
                        </div>
                        <span className="font-medium">{u.name}</span>
                        {u.id === user?.id && <span className="text-[10px] text-gray-400">(you)</span>}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-gray-500">{u.email}</td>
                    <td className="px-6 py-3">
                      <span className={`badge ${roleBadge[u.role] || "bg-gray-100 text-gray-800"}`}>{u.role}</span>
                    </td>
                    <td className="px-6 py-3">
                      <span className="badge bg-green-100 text-green-800">{u.companyId ? "DB" : "Demo"}</span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-300 disabled:cursor-not-allowed"
                          onClick={() => openEditUser(u)}
                          disabled={!isDbUser}
                          title={isDbUser ? "Edit this user" : "Connect a database to edit users"}
                        >
                          Edit
                        </button>
                        <button
                          className="text-xs font-medium text-red-600 hover:text-red-800 disabled:text-gray-300 disabled:cursor-not-allowed"
                          onClick={() => { setDeleteError(""); setDeleteTarget(u); }}
                          disabled={!isDbUser || u.id === user?.id || (u.role === "admin" && adminCount <= 1)}
                          title={
                            !isDbUser ? "Connect a database to delete users"
                            : u.id === user?.id ? "You can't delete yourself"
                            : u.role === "admin" && adminCount <= 1 ? "Can't delete the last admin"
                            : "Delete this user"
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add/Edit User Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-4">{isEditing ? "Edit Team Member" : "Add Team Member"}</h2>
            <form onSubmit={isEditing ? handleUpdateUser : handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input className="input-field" type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full name" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input className="input-field" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@company.com" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input className="input-field" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={isEditing ? "Leave blank to keep current password" : "At least 6 characters"} required={!isEditing} minLength={6} />
                {isEditing && <p className="text-xs text-gray-400 mt-1">Leave blank to keep the current password.</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select className="input-field" value={newRole} onChange={e => setNewRole(e.target.value as UserRole)}>
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
              </div>
              {addError && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{addError}</div>}
              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn-primary flex-1" disabled={adding}>{adding ? (isEditing ? "Saving..." : "Adding...") : (isEditing ? "Save Changes" : "Add User")}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Delete Confirm Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h2 className="text-lg font-semibold mb-2">Remove user?</h2>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently remove <strong>{deleteTarget.name}</strong> ({deleteTarget.email}).
              This can't be undone.
            </p>
            {deleteError && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4">{deleteError}</div>}
            <div className="flex gap-3">
              <button type="button" className="btn-secondary flex-1" onClick={() => { setDeleteTarget(null); setDeleteError(""); }} disabled={deleting}>Cancel</button>
              <button type="button" className="btn-primary flex-1 !bg-red-600 !hover:bg-red-700" onClick={handleDeleteUser} disabled={deleting}>{deleting ? "Deleting..." : "Delete"}</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
