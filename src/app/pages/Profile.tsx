import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import {
  CalendarClock,
  KeyRound,
  Loader2,
  Mail,
  PencilLine,
  ShieldCheck,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { useRbac } from "../../lib/rbac/RbacContext";
import { Role } from "../../lib/rbac/roles";
import {
  changePassword,
  fetchProfile,
  getAuthToken,
  sendOtp,
  type AuthUserDto,
  updateProfile,
  verifyOtp,
} from "../../lib/authApi";

function formatLastLogin(lastLoginAt?: string | null): string {
  if (!lastLoginAt) return "No recent login data";
  const date = new Date(lastLoginAt);
  if (Number.isNaN(date.getTime())) return "No recent login data";

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();

  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return sameDay ? `Today, ${time}` : date.toLocaleString();
}

export function Profile() {
  const { user, roleLabel, setUser } = useRbac();
  const [profile, setProfile] = useState<AuthUserDto | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editFirmName, setEditFirmName] = useState("");
  const [editProfileImage, setEditProfileImage] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const effectiveProfile = profile || {
    id: Number(user?.id || 0),
    name: user?.name || "N/A",
    email: user?.email || "N/A",
    mobile: "",
    role: user?.role || "sub_vendor",
    firmName: user?.firmName || "",
    profileImage: user?.profileImage || "",
    lastLoginAt: user?.lastLoginAt || null,
  };

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      const token = getAuthToken();
      if (!token) {
        setIsLoadingProfile(false);
        return;
      }

      setIsLoadingProfile(true);
      try {
        const data = await fetchProfile();
        if (!mounted) return;
        setProfile(data);

        if (user) {
          setUser({
            ...user,
            name: data.name,
            email: data.email,
            role: data.role as Role,
            firmName: data.firmName || "",
            profileImage: data.profileImage || "",
            lastLoginAt: data.lastLoginAt || null,
          });
        }
      } catch (error) {
        if (!mounted) return;
        toast.error((error as Error).message || "Failed to fetch profile");
      } finally {
        if (mounted) setIsLoadingProfile(false);
      }
    }

    void loadProfile();
    return () => {
      mounted = false;
    };
  }, []);

  const initials = useMemo(() => {
    return (
      effectiveProfile.name
        ?.split(" ")
        .map((part) => part.charAt(0))
        .join("")
        .slice(0, 2)
        .toUpperCase() || "NA"
    );
  }, [effectiveProfile.name]);

  const openEditDialog = () => {
    setEditName(effectiveProfile.name || "");
    setEditFirmName(effectiveProfile.firmName || "");
    setEditProfileImage(effectiveProfile.profileImage || "");
    setIsEditOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      toast.error("Name is required");
      return;
    }

    setIsSavingProfile(true);
    try {
      const updated = await updateProfile({
        name: editName.trim(),
        firmName: editFirmName.trim(),
        profileImage: editProfileImage.trim(),
      });

      setProfile(updated);
      if (user) {
        setUser({
          ...user,
          name: updated.name,
          email: updated.email,
          role: updated.role as Role,
          firmName: updated.firmName || "",
          profileImage: updated.profileImage || "",
          lastLoginAt: updated.lastLoginAt || null,
        });
      }

      toast.success("Profile updated successfully");
      setIsEditOpen(false);
    } catch (error) {
      toast.error((error as Error).message || "Failed to update profile");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const openPasswordDialog = () => {
    setOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setOtpSent(false);
    setIsPasswordOpen(true);
  };

  const handleSendOtp = async () => {
    if (!effectiveProfile.email || effectiveProfile.email === "N/A") {
      toast.error("No registered email found");
      return;
    }

    setIsSendingOtp(true);
    try {
      const otpResult = await sendOtp({ email: effectiveProfile.email });
      setOtpSent(true);
      if (otpResult.debugOtp) {
        toast.success(`${otpResult.message}. OTP: ${otpResult.debugOtp}`);
      } else {
        toast.success(otpResult.message);
      }
    } catch (error) {
      toast.error((error as Error).message || "Failed to send OTP");
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleChangePassword = async () => {
    if (!otpSent) {
      toast.error("Please send OTP first");
      return;
    }
    if (!otp.trim()) {
      toast.error("OTP is required");
      return;
    }
    if (!newPassword) {
      toast.error("New password is required");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setIsChangingPassword(true);
    try {
      await verifyOtp({ email: effectiveProfile.email, otp: otp.trim() });
      await changePassword({
        email: effectiveProfile.email,
        otp: otp.trim(),
        newPassword,
      });
      toast.success("Password changed successfully. Please login with new password.");
      setIsPasswordOpen(false);
    } catch (error) {
      toast.error((error as Error).message || "Failed to change password");
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-7rem)] rounded-2xl bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/40 p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Profile</h1>
          <p className="text-sm text-muted-foreground">Manage your account information and security settings.</p>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden border-slate-200/80 bg-white/95 shadow-sm backdrop-blur">
            <CardHeader className="border-b bg-gradient-to-r from-slate-900 to-blue-900 text-white">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16 border-2 border-white/35 shadow-sm">
                    <AvatarFallback className="bg-white/20 text-lg font-semibold text-white">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-1">
                    <CardTitle className="text-2xl font-semibold tracking-tight text-white">
                      {isLoadingProfile ? "Loading..." : effectiveProfile.name}
                    </CardTitle>
                    <p className="text-sm text-blue-100">{roleLabel || "Sub Vendor"}</p>
                    <p className="text-sm text-blue-200">{isLoadingProfile ? "Loading..." : effectiveProfile.email}</p>
                  </div>
                </div>
                <Badge className="w-fit rounded-full border border-emerald-300/50 bg-emerald-500/25 px-3 py-1 text-emerald-100">
                  Active
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-6 pt-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border bg-slate-50/70 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Account Status</p>
                  <p className="mt-1 text-sm font-medium text-slate-800">Active and verified</p>
                </div>
                <div className="rounded-xl border bg-slate-50/70 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Last Login</p>
                  <p className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-800">
                    <CalendarClock className="h-4 w-4 text-slate-500" />
                    {isLoadingProfile ? "Loading..." : formatLastLogin(effectiveProfile.lastLoginAt)}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="flex flex-wrap gap-3">
                <Button onClick={openEditDialog} className="rounded-lg shadow-sm" disabled={isLoadingProfile}>
                  <PencilLine className="mr-2 h-4 w-4" />
                  Edit Profile
                </Button>
                <Button
                  variant="outline"
                  onClick={openPasswordDialog}
                  className="rounded-lg border-slate-300 bg-white"
                  disabled={isLoadingProfile}
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Change Password
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="h-fit border-slate-200/90 bg-white/95 shadow-sm backdrop-blur">
            <CardHeader className="space-y-1 border-b">
              <CardTitle className="text-lg font-semibold text-slate-900">Account Details</CardTitle>
              <CardDescription className="text-sm">Your current account information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="rounded-xl border bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{isLoadingProfile ? "Loading..." : effectiveProfile.name}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-indigo-50 p-2 text-indigo-700">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
                    <p className="mt-1 break-all text-sm font-semibold text-slate-900">{isLoadingProfile ? "Loading..." : effectiveProfile.email}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Role</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{roleLabel || "Sub Vendor"}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-orange-50 p-2 text-orange-700">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Firm Name</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{isLoadingProfile ? "Loading..." : (effectiveProfile.firmName || "Not set")}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>Update your profile information.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-firm">Firm Name (Optional)</Label>
              <Input id="edit-firm" value={editFirmName} onChange={(e) => setEditFirmName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-image">Profile Image URL (Optional)</Label>
              <Input id="edit-image" value={editProfileImage} onChange={(e) => setEditProfileImage(e.target.value)} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsEditOpen(false)} disabled={isSavingProfile}>Cancel</Button>
              <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
                {isSavingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isPasswordOpen} onOpenChange={setIsPasswordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Send OTP to your email, verify it, and set a new password.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-700">
              Registered email: <span className="font-semibold">{effectiveProfile.email}</span>
            </div>

            <Button onClick={handleSendOtp} disabled={isSendingOtp || isChangingPassword} className="w-full">
              {isSendingOtp && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {otpSent ? "Resend OTP" : "Send OTP"}
            </Button>

            <div className="space-y-2">
              <Label htmlFor="otp">OTP</Label>
              <Input id="otp" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter 6-digit OTP" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsPasswordOpen(false)} disabled={isChangingPassword}>Cancel</Button>
              <Button onClick={handleChangePassword} disabled={isChangingPassword || isSendingOtp}>
                {isChangingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Change Password
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
