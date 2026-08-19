"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getDoc,
  orderBy,
  query as firestoreQuery,
  serverTimestamp,
  setDoc,
  where,
  onSnapshot,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import {
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Filter,
  GraduationCap,
  Heart,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

type InternshipItem = {
  id: string;
  company: string;
  role: string;
  location: string;
  type: string;
  requirements?: string;
  tags?: string[];
  createdAt?: unknown;
  createdBy?: string;
};

type ApplicationItem = {
  id: string;
  internshipId: string;
  company: string;
  role: string;
  location: string;
  studentId: string;
  studentEmail?: string;
  status: "submitted" | "accepted" | "declined";
  createdAt?: unknown;
  companyId?: string;
};

const avatarColors = [
  "bg-primary",
  "bg-emerald",
  "bg-sky",
  "bg-violet",
  "bg-orange",
  "bg-amber",
];

function getCompanyBadge(company: string) {
  const initials =
    company
      .split(" ")
      .filter(Boolean)
      .map((word) => word[0]?.toUpperCase())
      .join("")
      .slice(0, 2) || "CO";
  const color = avatarColors[company.length % avatarColors.length];
  return { initials, color };
}

function getPostedAgo(createdAt?: unknown) {
  if (!createdAt) return "Just posted";
  const date =
    createdAt instanceof Date
      ? createdAt
      : createdAt && typeof (createdAt as any).toDate === "function"
        ? (createdAt as any).toDate()
        : null;
  if (!date || Number.isNaN(date.getTime())) return "Just posted";
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function normalizeDropboxUrl(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  if (!value.includes("dropbox.com")) return value;
  try {
    const url = new URL(value);
    url.searchParams.delete("dl");
    url.searchParams.set("raw", "1");
    return url.toString();
  } catch {
    return value;
  }
}

const navItems = [
  { label: "Discover", icon: Search },
  { label: "My applications", icon: BriefcaseBusiness },
  { label: "Saved", icon: Heart },
];

export default function InternshipPlatform() {
  const [activeNav, setActiveNav] = useState("Discover");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [applied, setApplied] = useState<string[]>([]);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [actionMessage, setActionMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [course, setCourse] = useState("");
  const [location, setLocation] = useState("");
  const [detectedLocation, setDetectedLocation] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [locationTerms, setLocationTerms] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState("All types");
  const [showFilters, setShowFilters] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [skills, setSkills] = useState("");
  const [accountType, setAccountType] = useState<"student" | "company">(
    "student",
  );
  const [fullName, setFullName] = useState("");
  const [internships, setInternships] = useState<InternshipItem[]>([]);
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [selectedInternship, setSelectedInternship] =
    useState<InternshipItem | null>(null);
  const [isLoadingInternships, setIsLoadingInternships] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [notifications, setNotifications] = useState<
    { id: string; message: string; createdAt: number; applicationId?: string }[]
  >([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isCompanyAccount, setIsCompanyAccount] = useState<boolean | null>(
    null,
  );
  const [companyProfile, setCompanyProfile] = useState<any | null>(null);
  const [showApplicationsPanel, setShowApplicationsPanel] = useState(false);
  const [showSavedPanel, setShowSavedPanel] = useState(false);
  const [studentProfile, setStudentProfile] = useState<any | null>(null);
  const [profileImage, setProfileImage] = useState("");

  useEffect(() => {
    setShowApplicationsPanel(activeNav === "My applications");
    setShowSavedPanel(activeNav === "Saved");
    if (activeNav === "My applications") loadApplications();
  }, [activeNav]);

  const loadApplications = async () => {
    if (!currentUser) {
      setApplications([]);
      return;
    }
    try {
      const db = getFirebaseDb();
      const appsRef = collection(db, "applications");
      const snapshot = await getDocs(appsRef);
      const loaded = snapshot.docs
        .map((d) => ({ ...(d.data() as ApplicationItem), id: d.id }))
        .filter((app) => app.studentId === currentUser.uid)
        .sort(
          (a, b) =>
            (b.createdAt instanceof Date
              ? (b.createdAt as Date).getTime()
              : 0) -
            (a.createdAt instanceof Date ? (a.createdAt as Date).getTime() : 0),
        );
      setApplications(loaded);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setDisplayName(user?.displayName ?? "");
      if (!user) {
        setIsCompanyAccount(null);
        setProfileImage("");
        return;
      }
      (async () => {
        try {
          const db = getFirebaseDb();
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists() && (userDoc.data() as any).type === "company") {
            const companyDoc = await getDoc(doc(db, "companies", user.uid));
            setProfileImage(
              companyDoc.exists()
                ? normalizeDropboxUrl((companyDoc.data() as any).logo)
                : "",
            );
            setIsCompanyAccount(true);
            return;
          }
          // fallback: check companies collection
          const compDoc = await getDoc(doc(db, "companies", user.uid));
          setIsCompanyAccount(compDoc.exists());
          // load student profile when present
          const sp = await getDoc(doc(db, "studentProfiles", user.uid));
          if (sp.exists()) {
            const profile = sp.data();
            setStudentProfile(profile);
            setProfileImage(normalizeDropboxUrl((profile as any).photo));
          } else {
            setProfileImage("");
          }
        } catch (err) {
          console.error(err);
          setIsCompanyAccount(false);
        }
      })();
    });
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    // Use real-time listener so students receive live updates when company updates application status
    const db = getFirebaseDb();
    const appsRef = collection(db, "applications");
    const q = firestoreQuery(
      appsRef,
      where("studentId", "==", currentUser.uid),
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const loaded = snapshot.docs.map((doc) => ({
        ...(doc.data() as ApplicationItem),
        id: doc.id,
      }));
      setApplications(
        loaded.sort(
          (a, b) =>
            (b.createdAt instanceof Date
              ? (b.createdAt as Date).getTime()
              : 0) -
            (a.createdAt instanceof Date ? (a.createdAt as Date).getTime() : 0),
        ),
      );
      setApplied((current) =>
        current.filter(
          (internshipId) =>
            !loaded.some(
              (application) =>
                application.internshipId === internshipId &&
                (application.status === "accepted" ||
                  application.status === "declined"),
            ),
        ),
      );
      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data() as ApplicationItem;
        if (
          change.type === "modified" &&
          (data.status === "accepted" || data.status === "declined")
        ) {
          const notification = {
            id: `application-${change.doc.id}-${data.status}`,
            applicationId: change.doc.id,
            message: `Your application for ${data.role} was ${data.status}.`,
            createdAt: Date.now(),
          };
          setNotifications((current) => {
            const withoutDuplicate = current.filter(
              (item) =>
                item.id !== notification.id &&
                !(
                  item.applicationId === notification.applicationId &&
                  item.message === notification.message
                ),
            );
            return [notification, ...withoutDuplicate];
          });
        }
      });
    });
    // listen for explicit notifications written by companies
    const notesRef = collection(db, "notifications");
    // avoid composite-index requirement by ordering client-side
    const nq = firestoreQuery(notesRef, where("userId", "==", currentUser.uid));
    const unsubNotes = onSnapshot(nq, (snapshot) => {
      const loaded = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      if (loaded.length > 0) {
        const normalized = loaded.map((n: any) => ({
          id: n.id,
          applicationId: n.applicationId,
          message: n.message,
          createdAt:
            n.createdAt && typeof (n.createdAt as any).toDate === "function"
              ? (n.createdAt as any).toDate().getTime()
              : Date.now(),
        }));
        normalized.sort((a: any, b: any) => b.createdAt - a.createdAt);
        setNotifications((current) => {
          const merged = [...normalized, ...current];
          const seen = new Set<string>();
          return merged
            .filter((item) => {
              const key = item.applicationId
                ? `${item.applicationId}:${item.message}`
                : item.id;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .sort((a, b) => b.createdAt - a.createdAt);
        });
      }
    });
    return () => {
      unsub();
      unsubNotes();
    };
  }, [currentUser]);

  useEffect(() => {
    let mounted = true;
    const loadInternships = async () => {
      setFetchError("");
      setIsLoadingInternships(true);
      try {
        const db = getFirebaseDb();
        const internshipsRef = collection(db, "internships");
        const queryRef = firestoreQuery(
          internshipsRef,
          orderBy("createdAt", "desc"),
        );
        const snapshot = await getDocs(queryRef);
        if (!mounted) return;
        setInternships(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as Omit<InternshipItem, "id">),
          })),
        );
      } catch (error) {
        console.error(error);
        if (mounted)
          setFetchError("Unable to load placements. Please refresh the page.");
      } finally {
        if (mounted) setIsLoadingInternships(false);
      }
    };
    loadInternships();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(
    () =>
      internships.filter((item) => {
        const matchesSearch =
          `${item.role} ${item.company} ${item.location} ${item.tags?.join(" ") ?? ""}`
            .toLowerCase()
            .includes(query.toLowerCase());
        const normalizedItemLocation = item.location.toLowerCase();
        const matchesLocation =
          !locationFilter.trim() ||
          normalizedItemLocation.includes(
            locationFilter.trim().toLowerCase(),
          ) ||
          locationTerms.some((term) => normalizedItemLocation.includes(term));
        const matchesType =
          typeFilter === "All types" || item.type === typeFilter;
        return matchesSearch && matchesLocation && matchesType;
      }),
    [query, internships, locationFilter, locationTerms, typeFilter],
  );

  const toggleSaved = (id: string) =>
    setSaved((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );

  const showActionMessage = (
    text: string,
    tone: "success" | "error" = "error",
  ) => {
    setActionMessage({ text, tone });
  };

  const detectLocation = async () => {
    if (!navigator.geolocation) {
      showActionMessage("Location services are not available in this browser.");
      return;
    }
    if (!window.isSecureContext) {
      showActionMessage(
        "Location needs a secure connection. Open this app on localhost or HTTPS.",
      );
      return;
    }
    if (navigator.permissions) {
      const permission = await navigator.permissions.query({
        name: "geolocation",
      });
      if (permission.state === "denied") {
        showActionMessage(
          "Location is blocked. Click the lock icon beside the address bar, open Site settings, set Location to Allow, then try again.",
        );
        return;
      }
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const coordinates = `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;
        setDetectedLocation(coordinates);
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}`,
          );
          if (!response.ok) throw new Error("Reverse geocoding failed");
          const result = (await response.json()) as {
            address?: Record<string, string>;
          };
          const address = result.address ?? {};
          const area =
            address.city ||
            address.town ||
            address.village ||
            address.municipality ||
            address.state;
          const terms = [
            address.city,
            address.town,
            address.village,
            address.municipality,
            address.state_district,
            address.county,
            address.state,
          ]
            .filter((term): term is string => Boolean(term))
            .map((term) => term.toLowerCase());
          setLocationTerms([...new Set(terms)]);
          if (area) {
            setDetectedLocation(area);
            setLocationFilter(area);
            showActionMessage(`Showing roles in ${area}.`, "success");
          } else {
            showActionMessage(
              "Your coordinates were detected, but we could not identify the nearby area.",
            );
          }
        } catch (error) {
          console.error(error);
          showActionMessage(
            `Your coordinates were detected (${coordinates}), but nearby roles could not be matched by area.`,
          );
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        setIsLocating(false);
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Allow access in your browser settings and try again."
            : error.code === error.TIMEOUT
              ? "Location detection timed out. Please try again."
              : "We could not detect your location. Please try again.";
        showActionMessage(message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  };

  const apply = async (id: string) => {
    const internship = internships.find((item) => item.id === id);
    if (!currentUser) {
      showActionMessage("Please sign in before applying for a placement.");
      setShowAuth(true);
      return;
    }
    if (!internship) {
      showActionMessage("This placement is no longer available.");
      return;
    }
    if (isCompanyAccount) {
      showActionMessage("Company accounts cannot apply for roles.");
      return;
    }
    const existingApplication = applications.find(
      (application) => application.internshipId === id,
    );
    if (existingApplication || applied.includes(id)) {
      const statusMessage =
        existingApplication?.status === "accepted"
          ? "Your application for this role has already been accepted."
          : existingApplication?.status === "declined"
            ? "Your application for this role was declined. You cannot apply again."
            : "You have already applied for this role. Your application is still being reviewed.";
      showActionMessage(statusMessage);
      return;
    }
    // require student profile essentials before applying
    const required = [
      "displayName",
      "studentId",
      "phone",
      "course",
      "skills",
      "cv",
    ];
    const missing = required.filter(
      (k) => !studentProfile || !studentProfile[k],
    );
    if (missing.length > 0) {
      showActionMessage(
        "Complete your student profile at /settings before applying.",
      );
      return;
    }
    setApplied((current) =>
      current.includes(id) ? current : [...current, id],
    );
    try {
      const db = getFirebaseDb();
      const appRef = await addDoc(collection(db, "applications"), {
        internshipId: id,
        company: internship.company,
        role: internship.role,
        location: internship.location,
        studentId: currentUser.uid,
        studentEmail: currentUser.email,
        status: "submitted",
        createdAt: serverTimestamp(),
        companyId: internship.createdBy ?? "",
      });
      // notify the company about the new application
      try {
        if (internship.createdBy) {
          await addDoc(collection(db, "notifications"), {
            userId: internship.createdBy,
            message: `New application from ${currentUser.displayName || currentUser.email} for ${internship.role}.`,
            applicationId: appRef.id,
            fromUserId: currentUser.uid,
            createdAt: serverTimestamp(),
            read: false,
          });
        }
      } catch (err) {
        console.error("Failed to create company notification", err);
      }
      await loadApplications();
      setSelectedInternship(null);
      showActionMessage("Application submitted successfully.", "success");
    } catch (error) {
      console.error(error);
      setApplied((current) => current.filter((item) => item !== id));
      showActionMessage(
        "Your application could not be submitted. Please try again.",
      );
    }
  };

  useEffect(() => {
    if (!selectedInternship) {
      setCompanyProfile(null);
      return;
    }
    setCompanyProfile(null);
    const loadCompany = async () => {
      try {
        const db = getFirebaseDb();
        const companyId = selectedInternship.createdBy;
        if (!companyId) return;
        const docSnap = await getDoc(doc(db, "companies", companyId));
        if (docSnap.exists()) {
          const company = docSnap.data() as any;
          setCompanyProfile(company);
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadCompany();
  }, [selectedInternship?.id, selectedInternship?.createdBy]);

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthMessage("");
    setAuthSuccess("");
    try {
      const auth = getFirebaseAuth();
      const result =
        authMode === "signup"
          ? await createUserWithEmailAndPassword(auth, email, password)
          : await signInWithEmailAndPassword(auth, email, password);

      if (authMode === "signup") {
        const profileName = fullName.trim() || email.split("@")[0];
        await updateProfile(result.user, { displayName: profileName });
        const db = getFirebaseDb();
        await setDoc(doc(db, "users", result.user.uid), {
          uid: result.user.uid,
          email,
          type: accountType,
          name: profileName,
          createdAt: serverTimestamp(),
        });
      }

      setCurrentUser(result.user);
      setAuthSuccess(
        authMode === "signup"
          ? "Account created successfully. Welcome to Pathway."
          : "You are signed in successfully. Welcome back.",
      );
      setShowAuth(false);
    } catch (error) {
      const code =
        error instanceof Error && "code" in error
          ? String((error as { code?: string }).code)
          : "";
      const messages: Record<string, string> = {
        "auth/email-already-in-use":
          "That email already has an account. Try signing in instead.",
        "auth/invalid-credential": "The email or password is incorrect.",
        "auth/invalid-email": "Enter a valid email address.",
        "auth/weak-password":
          "Use a stronger password with at least 6 characters.",
        "auth/operation-not-allowed":
          "Email/password sign-in is disabled in Firebase Console.",
        "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
          "The Firebase web API key is missing or invalid.",
      };
      setAuthMessage(
        messages[code] ??
          "Could not complete that request. Check your details and Firebase Auth settings.",
      );
    }
  };

  const showNewListings = true;

  useEffect(() => {
    const filterButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Filters",
    );
    if (!filterButton) return;
    const toggleFilters = () => setShowFilters((current) => !current);
    filterButton.addEventListener("click", toggleFilters);
    return () => filterButton.removeEventListener("click", toggleFilters);
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <button
            className="flex items-center gap-3"
            onClick={() => setActiveNav("Discover")}
            aria-label="Pathway home"
          >
            <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Sparkles className="size-5" />
            </span>
            <span>
              <span className="block font-serif text-xl font-bold tracking-tight">
                pathway
              </span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                IT placements
              </span>
            </span>
          </button>
          <div className="hidden items-center gap-8 md:flex">
            {navItems.map(({ label, icon: Icon }) => (
              <button
                key={label}
                onClick={() => {
                  setActiveNav(label);
                  setShowApplicationsPanel(label === "My applications");
                  setShowSavedPanel(label === "Saved");
                  if (label === "My applications") loadApplications();
                }}
                className={`flex items-center gap-2 text-sm font-medium transition-colors ${activeNav === label ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
          <div className="relative flex items-center gap-3">
            <div className="relative">
              <button
                aria-label="Notifications"
                onClick={() => setShowNotifications((s) => !s)}
                className="flex size-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:text-foreground"
              >
                <Bell className="size-4" />
                {notifications.length > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold text-white">
                    {notifications.length}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 z-50 mt-3 w-80 rounded-2xl border border-border bg-card p-3 shadow-lg">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Notifications
                  </p>
                  <div className="mt-2 max-h-64 overflow-auto">
                    {notifications.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        No new notifications
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className="mb-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        >
                          {n.message}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            {!currentUser && (
              <button
                onClick={() => {
                  setAccountType("company");
                  setAuthMode("signup");
                  setAuthMessage("");
                  setAuthSuccess("");
                  setShowAuth(true);
                }}
                className="hidden rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary sm:inline-block"
              >
                Register as company
              </button>
            )}
            {isCompanyAccount === true && (
              <Link
                href="/company"
                className="hidden rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary sm:inline-block"
              >
                Company portal
              </Link>
            )}
            {currentUser ? (
              <>
                <Link
                  href="/settings"
                  className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-left hover:bg-secondary"
                >
                  <span className="flex size-8 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-xs font-bold text-primary">
                    {profileImage ? (
                      <img
                        src={profileImage}
                        alt="Profile"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      (currentUser.displayName || currentUser.email || "U")
                        .slice(0, 1)
                        .toUpperCase()
                    )}
                  </span>
                  <span className="hidden max-w-28 truncate text-sm font-semibold sm:block">
                    {currentUser.displayName || currentUser.email}
                  </span>
                </Link>
                <button
                  onClick={async () => {
                    await signOut(getFirebaseAuth());
                    setAuthSuccess("You have been signed out successfully.");
                  }}
                  className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:block"
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setAuthMessage("");
                  setAuthSuccess("");
                  setShowAuth(true);
                }}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <nav
        className="border-b border-border bg-card px-5 py-2 lg:hidden"
        aria-label="Your workspace"
      >
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">
          {navItems.map(({ label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => {
                setActiveNav(label);
                setShowApplicationsPanel(label === "My applications");
                setShowSavedPanel(label === "Saved");
                if (label === "My applications") loadApplications();
              }}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${activeNav === label ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
            >
              <Icon className="size-4" />
              {label}
              {label === "Saved" && saved.length > 0 && (
                <span className="text-xs">{saved.length}</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {authSuccess && (
        <div
          className="border-b border-emerald/20 bg-emerald/10 px-5 py-3 text-center text-sm font-semibold text-emerald"
          role="status"
        >
          <CheckCircle2 className="mr-2 inline size-4" />
          {authSuccess}
        </div>
      )}
      {actionMessage && (
        <div
          className={`fixed bottom-5 left-1/2 z-[70] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-lg ${actionMessage.tone === "success" ? "border-emerald/20 bg-emerald/10 text-emerald" : "border-rose-200 bg-rose-50 text-rose-700"}`}
          role="status"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{actionMessage.text}</span>
          <button
            onClick={() => setActionMessage(null)}
            aria-label="Dismiss message"
            className="text-lg leading-none opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}

      <section className="border-b border-border bg-secondary/40">
        <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-14">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card px-3 py-1.5 text-xs font-semibold text-primary">
              <Sparkles className="size-3.5" /> Your next chapter starts here
            </div>
            <h1 className="font-serif text-4xl font-bold tracking-tight text-balance md:text-5xl">
              Find an IT placement that fits{" "}
              <span className="text-primary">your future.</span>
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              Discover verified opportunities matched to your course, skills,
              and goals. No connections needed — just a clearer path forward.
            </p>
          </div>
          <div className="mt-8 flex max-w-4xl flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm md:flex-row">
            <div className="flex flex-1 items-center gap-3 rounded-xl bg-background px-4">
              <Search className="size-5 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search roles, skills, or companies"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <button
              onClick={detectLocation}
              disabled={isLocating}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border px-5 text-sm font-medium hover:bg-secondary disabled:cursor-wait disabled:opacity-60"
            >
              <MapPin className="size-4 text-primary" />{" "}
              {isLocating
                ? "Locating..."
                : detectedLocation || "Use my location"}{" "}
              <ChevronDown className="size-4" />
            </button>
            <button className="h-12 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Search placements
            </button>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-8 lg:grid-cols-[230px_1fr] lg:px-8">
        <aside className="hidden lg:block">
          <p className="mb-4 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Your workspace
          </p>
          <nav className="space-y-1">
            {navItems.map(({ label, icon: Icon }) => (
              <button
                key={label}
                onClick={() => setActiveNav(label)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${activeNav === label ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
              >
                <Icon className="size-4" />
                {label}
                {label === "Saved" && saved.length > 0 && (
                  <span className="ml-auto text-xs">{saved.length}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="mt-10 rounded-2xl bg-primary p-5 text-primary-foreground">
            <ShieldCheck className="mb-8 size-6" />
            <p className="font-serif text-lg font-bold">
              Every opportunity, verified.
            </p>
            <p className="mt-2 text-sm leading-6 text-primary-foreground/75">
              We review companies so you can focus on finding the right fit.
            </p>
          </div>
        </aside>

        <section>
          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-medium text-primary">
                Good morning, Amara
              </p>
              <h2 className="mt-1 font-serif text-3xl font-bold tracking-tight">
                Recommended for you
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Based on your Information Technology profile
              </p>
            </div>
            <button className="flex items-center gap-2 self-start rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-secondary">
              <Filter className="size-4" /> Filters
            </button>
          </div>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <Stat
              icon={Sparkles}
              label="Profile match"
              value="92%"
              detail="Great starting point"
            />
            <Stat
              icon={BriefcaseBusiness}
              label="Open placements"
              value={`${internships.length}`}
              detail="Updated from database"
            />
            <Stat
              icon={CheckCircle2}
              label="Applications"
              value={`${applied.length || 3}`}
              detail="2 awaiting response"
            />
          </div>
          <div className="space-y-4">
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
                {locationFilter
                  ? `No placements found in ${locationFilter}. Try detecting your location again.`
                  : "No placements found. Try another skill or role."}
              </div>
            ) : (
              filtered.map((item) => (
                <article
                  key={item.id}
                  className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                >
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                    <div
                      className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${getCompanyBadge(item.company).color} text-sm font-bold text-primary-foreground`}
                    >
                      {getCompanyBadge(item.company).initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col justify-between gap-2 sm:flex-row">
                        <div>
                          <h3 className="font-serif text-xl font-bold">
                            {item.role}
                          </h3>
                          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <Building2 className="size-3.5" />
                            {item.company}
                            <span className="text-border">•</span>
                            <MapPin className="size-3.5" />
                            {item.location}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="rounded-full bg-emerald/10 px-3 py-1.5 text-xs font-bold text-emerald">
                            Open role
                          </span>
                          <button
                            onClick={() => toggleSaved(item.id)}
                            aria-label={`Save ${item.role}`}
                            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-primary"
                          >
                            <Heart
                              className={`size-5 ${saved.includes(item.id) ? "fill-primary text-primary" : ""}`}
                            />
                          </button>
                        </div>
                      </div>
                      <div className="mt-5 flex flex-col justify-between gap-4 border-t border-border/70 pt-4 sm:flex-row sm:items-center">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                            {item.type}
                          </span>
                          {item.tags?.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock3 className="size-3.5" />
                            {getPostedAgo(item.createdAt)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => setSelectedInternship(item)}
                            className="flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold hover:bg-secondary"
                          >
                            View
                            <ArrowRight className="size-4" />
                          </button>
                          <button
                            onClick={() => apply(item.id)}
                            disabled={applied.includes(item.id)}
                            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${applied.includes(item.id) ? "bg-emerald/10 text-emerald" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
                          >
                            {applied.includes(item.id)
                              ? "Application sent"
                              : "Apply"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))
            )}
            <div className="mt-8 flex items-center justify-center">
              <button className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                View all placements <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        </section>
      </div>

      {selectedInternship && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/40 p-4 sm:items-center sm:p-5"
          role="dialog"
          aria-modal="true"
        >
          <div className="my-4 max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border bg-card p-5 shadow-xl sm:my-5 sm:max-h-[calc(100dvh-2.5rem)] sm:p-7">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-primary">
                  Internship details
                </p>
                <h2 className="mt-1 font-serif text-2xl font-bold">
                  {selectedInternship.role}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {selectedInternship.company} • {selectedInternship.location}
                </p>
              </div>
              <button
                onClick={() => setSelectedInternship(null)}
                className="text-2xl text-muted-foreground"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="space-y-5">
              <div className="rounded-3xl border border-border bg-secondary p-5">
                <p className="text-sm font-semibold text-foreground">Details</p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {selectedInternship.requirements ||
                    "No requirements provided."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedInternship.tags?.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              {companyProfile && (
                <div className="rounded-3xl border border-border bg-background p-5">
                  <div className="flex items-start gap-4">
                    {companyProfile.logo ? (
                      <img
                        src={normalizeDropboxUrl(companyProfile.logo)}
                        alt={`${companyProfile.name || selectedInternship.company} logo`}
                        className="size-16 shrink-0 rounded-2xl border border-border object-cover"
                      />
                    ) : (
                      <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary">
                        {(companyProfile.name || selectedInternship.company || "C")
                          .slice(0, 1)
                          .toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                        Company profile
                      </p>
                      <h3 className="mt-1 text-lg font-bold">
                        {companyProfile.name || selectedInternship.company}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {companyProfile.industry || "Industry not provided"}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">
                    {companyProfile.description || "No company description provided."}
                  </p>
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <p>
                      <span className="text-muted-foreground">Location:</span>{" "}
                      {companyProfile.address || companyProfile.state || "Not provided"}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Employees:</span>{" "}
                      {companyProfile.numberEmployees || "Not provided"}
                    </p>
                    <p className="sm:col-span-2">
                      <span className="text-muted-foreground">Website:</span>{" "}
                      {companyProfile.website ? (
                        <a
                          href={companyProfile.website}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          {companyProfile.website}
                        </a>
                      ) : (
                        "Not provided"
                      )}
                    </p>
                  </div>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-border bg-card p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Type
                  </p>
                  <p className="mt-2 font-semibold">
                    {selectedInternship.type}
                  </p>
                </div>
                <div className="rounded-3xl border border-border bg-card p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Posted
                  </p>
                  <p className="mt-2 font-semibold">
                    {getPostedAgo(selectedInternship.createdAt)}
                  </p>
                </div>
                <div className="rounded-3xl border border-border bg-card p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Status
                  </p>
                  <p className="mt-2 font-semibold">
                    {applied.includes(selectedInternship.id)
                      ? "Applied"
                      : "Open"}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  onClick={() => {
                    if (!applied.includes(selectedInternship.id))
                      apply(selectedInternship.id);
                  }}
                  disabled={applied.includes(selectedInternship.id)}
                  className={`flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold ${applied.includes(selectedInternship.id) ? "bg-emerald/10 text-emerald" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
                >
                  {applied.includes(selectedInternship.id)
                    ? "Application sent"
                    : "Apply now"}
                </button>
                <button
                  onClick={() => setSelectedInternship(null)}
                  className="rounded-xl border border-border bg-background px-5 py-3 text-sm font-semibold text-muted-foreground hover:bg-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showSettings && currentUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-5"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-7 shadow-xl">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-primary">
                  Your student profile
                </p>
                <h2 className="mt-1 font-serif text-2xl font-bold">Settings</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Keep your placement preferences up to date.
                </p>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="text-2xl text-muted-foreground"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <label className="block text-sm font-medium">
                Full name
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none ring-primary focus:ring-2"
                  placeholder="Your name"
                />
              </label>
              <label className="block text-sm font-medium">
                Course or field
                <input
                  value={course}
                  onChange={(event) => setCourse(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none ring-primary focus:ring-2"
                  placeholder="Information Technology"
                />
              </label>
              <label className="block text-sm font-medium">
                Preferred location
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none ring-primary focus:ring-2"
                  placeholder="Accra, Kumasi, or Remote"
                />
              </label>
              <label className="block text-sm font-medium">
                Skills
                <input
                  value={skills}
                  onChange={(event) => setSkills(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none ring-primary focus:ring-2"
                  placeholder="React, networking, data analysis"
                />
              </label>
              <button
                onClick={async () => {
                  const db = getFirebaseDb();
                  await updateProfile(currentUser, { displayName });
                  await setDoc(
                    doc(db, "studentProfiles", currentUser.uid),
                    {
                      displayName,
                      course,
                      preferredLocation: location,
                      skills: skills
                        .split(",")
                        .map((skill) => skill.trim())
                        .filter(Boolean),
                      updatedAt: serverTimestamp(),
                    },
                    { merge: true },
                  );
                  setCurrentUser(getFirebaseAuth().currentUser);
                  setShowSettings(false);
                  setAuthSuccess("Your profile details have been saved.");
                }}
                className="h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground"
              >
                Save profile
              </button>
            </div>
          </div>
        </div>
      )}

      {showAuth && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-5"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-7 shadow-xl">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-primary">
                  Join Pathway
                </p>
                <h2 className="mt-1 font-serif text-2xl font-bold">
                  Create your student profile
                </h2>
              </div>
              <button
                onClick={() => setShowAuth(false)}
                className="text-2xl text-muted-foreground"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mb-5 grid grid-cols-2 rounded-xl bg-secondary p-1 text-sm font-medium">
              <button
                onClick={() => setAuthMode("signup")}
                className={`rounded-lg py-2 ${authMode === "signup" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
              >
                Create account
              </button>
              <button
                onClick={() => setAuthMode("login")}
                className={`rounded-lg py-2 ${authMode === "login" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
              >
                Sign in
              </button>
            </div>
            <form onSubmit={submitAuth} className="space-y-4">
              <label className="block text-sm font-medium">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none ring-primary focus:ring-2"
                  placeholder="you@example.com"
                />
              </label>
              <label className="block text-sm font-medium">
                Password
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none ring-primary focus:ring-2"
                  placeholder="At least 6 characters"
                />
              </label>
              {authMessage && (
                <p className="text-sm text-muted-foreground">{authMessage}</p>
              )}
              <button className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground">
                {authMode === "signup" ? "Create account" : "Sign in"}{" "}
                <ArrowRight className="size-4" />
              </button>
            </form>
            <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
              By continuing, you agree to use Pathway for genuine education and
              career opportunities.
            </p>
          </div>
        </div>
      )}
      {showApplicationsPanel && currentUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-5"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl rounded-3xl border border-border bg-card p-7 shadow-xl">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-primary">
                  My applications
                </p>
                <h2 className="mt-1 font-serif text-2xl font-bold">
                  Applications
                </h2>
              </div>
              <button
                onClick={() => setShowApplicationsPanel(false)}
                className="text-2xl text-muted-foreground"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              {applications.filter(
                (a) => a.status === "accepted" || a.status === "declined",
              ).length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No accepted or declined applications yet.
                </div>
              ) : (
                <ul className="space-y-3">
                  {applications
                    .filter(
                      (a) => a.status === "accepted" || a.status === "declined",
                    )
                    .map((a) => (
                      <li
                        key={a.id}
                        className="rounded-2xl border border-border bg-background p-4"
                      >
                        <p className="text-sm font-semibold text-foreground">
                          {a.role}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {a.company} • {a.location}
                        </p>
                        <p className="mt-2 text-sm font-medium">{a.status}</p>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
      {showSavedPanel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-5"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl rounded-3xl border border-border bg-card p-7 shadow-xl">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-primary">
                  Saved placements
                </p>
                <h2 className="mt-1 font-serif text-2xl font-bold">Saved</h2>
              </div>
              <button
                onClick={() => setShowSavedPanel(false)}
                className="text-2xl text-muted-foreground"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              {internships.filter((i) => saved.includes(i.id)).length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No saved placements yet.
                </div>
              ) : (
                <ul className="space-y-3">
                  {internships
                    .filter((i) => saved.includes(i.id))
                    .map((i) => (
                      <li
                        key={i.id}
                        className="rounded-2xl border border-border bg-background p-4"
                      >
                        <p className="text-sm font-semibold text-foreground">
                          {i.role}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {i.company} • {i.location}
                        </p>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
      {showFilters && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-foreground/30 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Placement filters"
        >
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Filter placements</h2>
              <button
                onClick={() => setShowFilters(false)}
                aria-label="Close filters"
                className="text-2xl leading-none text-muted-foreground"
              >
                ×
              </button>
            </div>
            <div className="mt-5 grid gap-4">
              <label className="text-sm font-medium">
                Location
                <input
                  value={locationFilter}
                  onChange={(event) => {
                    setLocationFilter(event.target.value);
                    setLocationTerms([]);
                  }}
                  placeholder="Accra, Kumasi, or Remote"
                  className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none ring-primary focus:ring-2"
                />
              </label>
              <label className="text-sm font-medium">
                Job type
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none ring-primary focus:ring-2"
                >
                  <option>All types</option>
                  <option>Remote</option>
                  <option>Hybrid</option>
                  <option>On-site</option>
                </select>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setLocationFilter("");
                  setLocationTerms([]);
                  setTypeFilter("All types");
                  setDetectedLocation("");
                }}
                className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-secondary"
              >
                Clear
              </button>
              <button
                onClick={() => setShowFilters(false)}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Apply filters
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Sparkles;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className="size-4 text-primary" />
      </div>
      <p className="mt-3 font-serif text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
