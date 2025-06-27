/* global __initial_auth_token */
import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, addDoc, updateDoc, query, where, serverTimestamp, deleteDoc, getDocs, writeBatch, orderBy } from 'firebase/firestore';
import { Shield, Phone, UserPlus, Send, AlertTriangle, CheckCircle, XCircle, Users, MessageSquare, Trash2, Copy, Sparkles, BrainCircuit, Headphones, Notebook, BookOpen, Smile, Meh, Frown, Bot, Star, Lock, ArrowLeft } from 'lucide-react';

// Import JournalView component - PATH ASSUMES JournalView.jsx IS DIRECTLY IN src/
import JournalView from './JournalView.jsx'; 

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyCQ9Y2EUa_a3NjWcY7lcRg9pw", 
  authDomain: "status-check-bb7ca.firebaseapp.com",
  projectId: "status-check-bb7ca",
  storageBucket: "status-check-bb7ca.firebasestorage.app",
  messagingSenderId: "364228768275",
  appId: "1:364228768275:web:ac44851ba61ac2c27e45e6",
  measurementId: "G-1BPSCS31T5"
};
const appId = "status-check-bb7ca"; 

// This function is used by AI features and needs to be defined once globally or passed down
async function generateGeminiContent(prompt, history = []) {
    const apiKey = ""; // API key will be provided by Canvas runtime
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const payload = { contents: [...history, { role: "user", parts: [{ text: prompt }] }] };
    try {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error(`API call failed: ${response.status}`);
        const result = await response.json();
        return result.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (error) { console.error("Gemini API call error:", error); return null; }
}


// --- Main App Component ---
export default function App() {
    // --- State Management ---
    const [fbServices, setFbServices] = useState({ auth: null, db: null });
    const [user, setUser] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    
    const [userData, setUserData] = useState({ displayName: '', circle: [], status: 'ok', isPremium: false });
    const [isLoading, setIsLoading] = useState(true);
    const [currentView, setCurrentView] = useState('main'); 
    
    const [activeAlert, setActiveAlert] = useState(null);
    const [incomingAlerts, setIncomingAlerts] = useState([]);

    const [notifications, setNotifications] = useState([]);

    // --- Firebase Initialization and Auth Listener ---
    useEffect(() => {
        if (firebaseConfig && firebaseConfig.apiKey) {
            try {
                const app = initializeApp(firebaseConfig);
                const authInstance = getAuth(app);
                const dbInstance = getFirestore(app);
                setFbServices({ auth: authInstance, db: dbInstance });

                const unsubscribe = onAuthStateChanged(authInstance, async (currentUser) => {
                    if (currentUser) {
                        setUser(currentUser);
                    } else {
                         try {
                            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) { 
                                await signInWithCustomToken(authInstance, __initial_auth_token); 
                            } else { 
                                await signInAnonymously(authInstance); 
                            }
                        } catch (error) { console.error("Authentication failed:", error); }
                    }
                    setIsAuthReady(true);
                });
                return () => unsubscribe();
            } catch (e) {
                console.error("Error initializing Firebase", e);
                setIsLoading(false);
                setIsAuthReady(true);
            }
        } else {
             console.error("Firebase config is missing or invalid.");
             setIsLoading(false);
             setIsAuthReady(true);
        }
    }, []);

    // --- User Data Listener (CONSOLIDATED AND DEBUGGED) ---
    useEffect(() => {
        if (isAuthReady && user && fbServices.db) {
            // FIX: Changed path to /artifacts/{appId}/users/{user.uid}/private/profile
            const userProfileDocPath = `/artifacts/${appId}/users/${user.uid}/private/profile`;

            // START OF DEBUGGING ADDITION
            console.log("DEBUG: Setting up User Data Listener for path:", userProfileDocPath);
            // END OF DEBUGGING ADDITION

            const userProfileDocRef = doc(fbServices.db, userProfileDocPath);
            const unsubscribe = onSnapshot(userProfileDocRef, (docSnap) => {
                if (docSnap.exists()) { 
                    setUserData(docSnap.data()); 
                } else {
                    const newName = `User-${user.uid.substring(0, 6)}`;
                    const initialData = { displayName: newName, circle: [], status: 'ok', isPremium: false };
                    // START OF DEBUGGING ADDITION
                    console.log("DEBUG: User profile document does not exist, creating with initial data:", initialData);
                    // END OF DEBUGGING ADDITION
                    setDoc(userProfileDocRef, initialData); // This sets the initial user data if doc doesn't exist
                    setUserData(initialData);
                }
                setIsLoading(false);
            }, (error) => {
                console.error("DEBUG: User Data Listener Error:", error); // Make sure this logs the full error object!
                setIsLoading(false);
            });
            return () => unsubscribe();
        } else if (isAuthReady && !user) {
            setIsLoading(false);
        }
    }, [isAuthReady, user, fbServices.db]);
    
    // --- Alerts & Notifications Listener ---
    useEffect(() => {
        if (!isAuthReady || !user || !fbServices.db) return;

        // --- ALERTS LISTENER ---
        const alertsCollectionPath = `/artifacts/${appId}/public/data/alerts`;
        const userIdForAlertsQuery = user.uid; 

        // START OF DEBUGGING ADDITION (Alerts Listener)
        console.log("DEBUG: Setting up Alerts Listener for collection:", alertsCollectionPath);
        console.log("DEBUG: Alerts Query: where('circleUserIds', 'array-contains', UID:", userIdForAlertsQuery, ")");
        // END OF DEBUGGING ADDITION

        const alertsCollectionRef = collection(fbServices.db, alertsCollectionPath);
        const qAlerts = query(alertsCollectionRef, where("circleUserIds", "array-contains", userIdForAlertsQuery));
        const unsubscribeAlerts = onSnapshot(qAlerts, (snapshot) => {
            const newAlerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(a => a.status === 'active' || a.status === 'acknowledged');
            setIncomingAlerts(newAlerts);
        }, (error) => console.error("DEBUG: Alerts Listener Error:", error)); // Make sure this logs the full error object!

        // --- NOTIFICATIONS LISTENER ---
        const notificationsCollectionPath = `/artifacts/${appId}/users/${user.uid}/notifications`;

        // START OF DEBUGGING ADDITION (Notifications Listener)
        console.log("DEBUG: Setting up Notifications Listener for collection:", notificationsCollectionPath);
        console.log("DEBUG: Notifications Query: orderBy('createdAt', 'desc')");
        // END OF DEBUGGING ADDING
        
        const notificationsCollectionRef = collection(fbServices.db, notificationsCollectionPath);
        const qNotifications = query(notificationsCollectionRef, orderBy("createdAt", "desc"));
        const unsubscribeNotifications = onSnapshot(qNotifications, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") { addNotification({ id: change.doc.id, ...change.doc.data() }); }
            });
        }, (error) => console.error("DEBUG: Notifications Listener Error:", error)); // Make sure this logs the full error object!

        return () => { unsubscribeAlerts(); unsubscribeNotifications(); };
    }, [isAuthReady, user, fbServices.db]);
    
    const addNotification = (notif) => {
        setNotifications(prev => [{...notif, uniqueId: Date.now()}, ...prev.slice(0, 4)]);
        const timeoutId = setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.uniqueId !== notif.uniqueId));
             if (fbServices.db && user && notif.id && typeof notif.id === 'string') {
                 deleteDoc(doc(fbServices.db, `/artifacts/${appId}/users/${user.uid}/notifications/${notif.id}`)).catch(err => console.log("Failed to delete notification doc", err));
            }
        }, 8000);
    };

    const sendSystemNotification = async (targetUserId, message, type = 'info', from = {id: user.uid, name: userData.displayName }) => {
        if (!fbServices.db || !user) return;
        // START OF DEBUGGING ADDITION (Send System Notification)
        console.log("DEBUG: Sending system notification to:", targetUserId);
        console.log("DEBUG: Notification Message:", message);
        // END OF DEBUGGING ADDITION
        await addDoc(collection(fbServices.db, `/artifacts/${appId}/users/${targetUserId}/notifications`), { message, type, createdAt: serverTimestamp(), from });
    };

    const sendAlert = async (level) => {
        if (!fbServices.db || !user || userData.circle.length === 0) {
            addNotification({ id: Date.now().toString(), type: 'error', message: "Add friends to your circle first." }); return;
        }
        const newAlert = { fromUser: { id: user.uid, name: userData.displayName }, circleUserIds: userData.circle.map(c => c.id), status: 'active', responder: null, createdAt: serverTimestamp(), level };
        // START OF DEBUGGING ADDITION (Send Alert)
        console.log("DEBUG: Sending alert with level:", level);
        console.log("DEBUG: Alert data:", newAlert);
        // END OF DEBUGGING ADDITION
        const docRef = await addDoc(collection(fbServices.db, `/artifacts/${appId}/public/data/alerts`), newAlert);
        if (level === 'red') { setActiveAlert({ id: docRef.id, ...newAlert }); }
        else { addNotification({id: Date.now().toString(), type: 'success', message: 'Support request sent to your circle.'}) }

        const message = level === 'red' 
            ? `is in crisis and needs help now!` 
            : `is having a hard time and could use some support.`;
        userData.circle.forEach(member => sendSystemNotification(member.id, message, `${level}-alert`));
    };

    const cancelTroubleAlert = async () => {
        if (!fbServices.db || !activeAlert) return;
        // START OF DEBUGGING ADDITION (Cancel Alert)
        console.log("DEBUG: Cancelling alert with ID:", activeAlert.id);
        // END OF DEBUGGING ADDITION
        await updateDoc(doc(fbServices.db, `/artifacts/${appId}/public/data/alerts/${activeAlert.id}`), { status: 'resolved' });
        const message = `${userData.displayName}'s alert has been cancelled/resolved.`;
        userData.circle.forEach(member => sendSystemNotification(member.id, message, 'resolved'));
        setActiveAlert(null);
    };

    const respondToAlert = async (alert) => {
        if(!fbServices.db || !user) return;
        // START OF DEBUGGING ADDITION (Respond to Alert)
        console.log("DEBUG: Responding to alert with ID:", alert.id, " by user:", user.uid);
        // END OF DEBUGGING ADDITION
        await updateDoc(doc(fbServices.db, `/artifacts/${appId}/public/data/alerts/${alert.id}`), { status: 'acknowledged', responder: { id: user.uid, name: userData.displayName } });
        sendSystemNotification(alert.fromUser.id, `${userData.displayName} is responding to your alert.`, 'acknowledged');
        const circleMessage = `${userData.displayName} has responded to ${alert.fromUser.name}'s alert.`;
        alert.circleUserIds.forEach(memberId => {
            if (memberId !== user.uid && memberId !== alert.fromUser.id) { sendSystemNotification(memberId, circleMessage, 'info'); }
        });
    };

    const handleStatusChange = async (newStatus) => {
        if (fbServices.db && user) {
            // FIX: Updated path for updating user's profile data
            const userProfileDocRef = doc(fbServices.db, `/artifacts/${appId}/users/${user.uid}/private/profile`);
            // START OF DEBUGGING ADDITION (Handle Status Change)
            console.log("DEBUG: Updating user status to:", newStatus, " for user:", user.uid, " at path:", userProfileDocRef.path);
            // END OF DEBUGGING ADDITION
            await updateDoc(userProfileDocRef, { status: newStatus });
        }
    };
    
    const handleUpgrade = async () => {
        if (fbServices.db && user) {
            // FIX: Updated path for upgrading user's profile data
            const userProfileDocRef = doc(fbServices.db, `/artifacts/${appId}/users/${user.uid}/private/profile`);
            // START OF DEBUGGING ADDITION (Upgrade)
            console.log("DEBUG: Upgrading user to premium for user:", user.uid, " at path:", userProfileDocRef.path);
            // END OF DEBUGGING ADDITION
            await updateDoc(userProfileDocRef, { isPremium: true });
            addNotification({id: Date.now().toString(), type:'success', message: "Welcome to Premium! All features unlocked."});
        }
    };

    if (!isAuthReady || isLoading) return <div className="flex items-center justify-center h-screen bg-gray-900 text-white"><div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-400"></div></div>;
    if (!fbServices.db) return <div className="flex items-center justify-center h-screen bg-gray-900 text-white"><p>Error: Firebase is not connected. Please check your configuration.</p></div>;

    const renderView = () => {
        switch (currentView) {
            case 'circle': return <ManageCircleView db={fbServices.db} user={user} userData={userData} addNotification={addNotification} />;
            case 'profile': return <ProfileView db={fbServices.db} user={user} userData={userData} onUpgrade={handleUpgrade} setCurrentView={setCurrentView} />;
            // Now JournalView is correctly imported and passed as a component
            case 'journal': return <JournalView db={fbServices.db} user={user} addNotification={addNotification} isPremium={userData.isPremium} setCurrentView={setCurrentView} />;
            case 'resources': return <ResourcesView isPremium={userData.isPremium} setCurrentView={setCurrentView} />;
            case 'ai-companion': return <AICompanionView isPremium={userData.isPremium} addNotification={addNotification} setCurrentView={setCurrentView} />;
            case 'privacy': return <PrivacyPolicyView setCurrentView={setCurrentView} />;
            default: return <MainView userData={userData} sendAlert={sendAlert} activeAlert={activeAlert} cancelTroubleAlert={cancelTroubleAlert} addNotification={addNotification} sendSystemNotification={sendSystemNotification} onStatusChange={handleStatusChange} />;
        }
    };
    
    const crisisAlert = incomingAlerts.find(a => a.status === 'active' && a.level === 'red');

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans flex flex-col">
            {crisisAlert && <CrisisModal alert={crisisAlert} onRespond={respondToAlert} />}
            <NotificationArea notifications={notifications} />
            <header className="bg-gray-800 p-4 shadow-lg flex justify-between items-center z-20">
                <div className="flex items-center space-x-3">
                    <Shield className="text-blue-400 h-8 w-8" />
                    <h1 className="text-2xl font-bold tracking-wider">Status Check</h1>
                </div>
                <div className="text-xs text-gray-400 flex-grow text-right pr-2"> {/* Added flex-grow, text-right, pr-2 */}
                    <span>Your ID: {user?.uid}</span>
                    <CopyButton textToCopy={user?.uid} />
                </div>
            </header>
            <main className="flex-grow p-4 md:p-6 lg:p-8 overflow-y-auto">
                {renderView()}
            </main>
            <footer className="bg-gray-800 p-2 mt-auto z-20">
                <nav className="flex justify-around items-center">
                    <NavButton icon={<Phone size={24}/>} label="Home" view="main" currentView={currentView} setCurrentView={setCurrentView} />
                    <NavButton icon={<Users size={24}/>} label="My Circle" view="circle" currentView={currentView} setCurrentView={setCurrentView} />
                    <NavButton icon={<Bot size={24}/>} label="Companion" view="ai-companion" currentView={currentView} setCurrentView={setCurrentView} isPremium={userData.isPremium} />
                    <NavButton icon={<Notebook size={24}/>} label="Journal" view="journal" currentView={currentView} setCurrentView={setCurrentView} />
                    <NavButton icon={<BookOpen size={24}/>} label="Resources" view="resources" currentView={currentView} setCurrentView={setCurrentView} />
                    <NavButton icon={<UserPlus size={24}/>} label="Profile" currentView={currentView} setCurrentView={setCurrentView} />
                </nav>
            </footer>
        </div>
    );
}

// All other components that were previously in App.js (ManageCircleView, ProfileView, etc.)
// are defined below this point.

const NavButton = ({ icon, label, view, currentView, setCurrentView, isPremium }) => (
    <button onClick={() => setCurrentView(view)} className={`flex flex-col items-center p-2 rounded-lg transition-colors w-1/6 ${currentView === view ? 'text-blue-400 bg-gray-700' : 'text-gray-400 hover:bg-gray-700'} relative`}>
        {icon}
        <span className="text-xs mt-1">{label}</span>
        {(view === 'ai-companion' && !isPremium) && <Lock size={12} className="absolute top-1 right-1 text-yellow-400" />}
    </button>
);

const PremiumLock = ({ setCurrentView }) => (
    <div className="text-center p-8 bg-gray-800 rounded-2xl shadow-lg">
        <Star className="mx-auto text-yellow-400 h-16 w-16 mb-4" />
        <h3 className="text-2xl font-bold text-white mb-2">Premium Feature</h3>
        <p className="text-gray-300 mb-6">Unlock this feature and more with a Premium subscription.</p>
        <button onClick={() => onUpgrade()} className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-6 rounded-lg transition-colors">
            <Star size={20} />
            <span>Upgrade for $2.99/month</span>
        </button>
    </div>
);

function MainView({ userData, sendAlert, activeAlert, cancelTroubleAlert, addNotification, sendSystemNotification, onStatusChange }) {
    return (
        <div className="flex flex-col items-center h-full space-y-6">
            <DailyStatusSelector currentStatus={userData.status} onStatusChange={onStatusChange} />
            <div className="w-full max-w-md mx-auto">
                {activeAlert ? (
                     <ActiveAlertCard alert={activeAlert} onCancel={cancelTroubleAlert} addNotification={addNotification} />
                ) : (
                    <div className="flex flex-col items-center space-y-4">
                         <button onClick={() => sendAlert('red')} className="w-64 h-64 rounded-full bg-red-600 hover:bg-red-700 active:bg-red-800 flex flex-col items-center justify-center text-white shadow-2xl transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-red-400">
                            <AlertTriangle size={64} />
                            <span className="mt-4 text-3xl font-bold">CRISIS ALERT</span>
                        </button>
                        <button onClick={() => sendAlert('yellow')} className="w-full max-w-sm bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-4 px-6 rounded-lg transition-colors flex items-center justify-center space-x-2">
                             <AlertTriangle size={20}/>
                             <span>Request Support</span>
                        </button>
                    </div>
                )}
            </div>
            <div className="w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl">
                 <WellbeingChatRequester circle={userData.circle} addNotification={addNotification} sendSystemNotification={sendSystemNotification} />
            </div>
            <div className="w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl">
                 <EnhancedStatusCheckSender circle={userData.circle} addNotification={addNotification} sendSystemNotification={sendSystemNotification} />
            </div>
        </div>
    );
}

function ManageCircleView({ db, user, userData, addNotification }) {
    const [circleStatuses, setCircleStatuses] = useState({});

    useEffect(() => {
        if (userData.circle.length > 0 && db && appId) {
            const fetchStatuses = async () => {
                const statuses = {};
                for (const friend of userData.circle) {
                    try {
                        const friendDocRef = doc(db, `/artifacts/${appId}/users/${friend.id}`);
                        // START OF DEBUGGING ADDITION (Fetch Friend Status)
                        console.log("DEBUG: Fetching friend status for:", friend.id);
                        // END OF DEBUGGING ADDITION
                        const docSnap = await getDoc(friendDocRef);
                        if (docSnap.exists()) {
                            statuses[friend.id] = docSnap.data().status || 'ok';
                        }
                    } catch (e) { console.error("Error fetching friend status:", e) }
                }
                setCircleStatuses(statuses);
            };
            fetchStatuses();
        }
    }, [userData.circle, db]);
    
    const [newFriendId, setNewFriendId] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const handleAddFriend = async (e) => {
        e.preventDefault();
        if (!newFriendId.trim() || !user || !db) return;
        if (newFriendId.trim() === user.uid) { addNotification({ id: Date.now().toString(), type: 'error', message: 'You cannot add yourself.' }); return; }
        if (userData.circle.some(f => f.id === newFriendId.trim())) { addNotification({ id: Date.now().toString(), type: 'error', message: 'This user is already in your circle.' }); return; }
        setIsAdding(true);
        try {
            const friendDocRef = doc(db, `/artifacts/${appId}/users/${newFriendId.trim()}`);
            // START OF DEBUGGING ADDITION (Check Friend Existence)
            console.log("DEBUG: Checking existence of friend ID:", newFriendId.trim());
            // END OF DEBUGGING ADDITION
            const friendDocSnap = await getDoc(friendDocRef);
            if (friendDocSnap.exists()) {
                const friendData = friendDocSnap.data();
                const newCircleMember = { id: friendDocSnap.id, name: friendData.displayName };
                const userDocRef = doc(db, `/artifacts/${appId}/users/${user.uid}/private/profile`); // FIX: Updated path for adding friend to user's profile
                // START OF DEBUGGING ADDITION (Add Friend)
                console.log("DEBUG: Adding friend. Updating user:", user.uid, " circle with:", newCircleMember, " at path:", userDocRef.path);
                // END OF DEBUGGING ADDITION
                await updateDoc(userDocRef, { circle: [...userData.circle, newCircleMember] });
                addNotification({ id: Date.now().toString(), type: 'success', message: `${friendData.displayName} added to your circle.` });
                setNewFriendId('');
            } else { addNotification({ id: Date.now().toString(), type: 'error', message: 'User ID not found.' }); }
        } catch (error) { console.error("Error adding friend:", error); addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not add friend.' }); } 
        finally { setIsAdding(false); }
    };
    
    const handleRemoveFriend = async (friendId) => {
        if(!db || !user) return;
        try {
            const updatedCircle = userData.circle.filter(f => f.id !== friendId);
            const userDocRef = doc(db, `/artifacts/${appId}/users/${user.uid}/private/profile`); // FIX: Updated path for removing friend from user's profile
            // START OF DEBUGGING ADDITION (Remove Friend)
            console.log("DEBUG: Removing friend:", friendId, " from user:", user.uid, " circle at path:", userDocRef.path);
            // END OF DEBUGGING ADDITION
            await updateDoc(userDocRef, { circle: updatedCircle });
            addNotification({ id: Date.now().toString(), type: 'success', message: 'Friend removed from circle.' });
        } catch (error) { console.error("Error removing friend:", error); addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not remove friend.' }); }
    };
    
    const StatusIcon = ({status}) => {
        switch (status) {
            case 'good': return <Smile size={24} className="text-green-400" />;
            case 'uneasy': return <Meh size={24} className="text-yellow-400" />;
            case 'struggling': return <Frown size={24} className="text-red-400" />;
            default: return <Smile size={24} className="text-gray-500" />;
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold mb-6 text-blue-300">My Support Circle</h2>
            <form onSubmit={handleAddFriend} className="mb-8 p-6 bg-gray-800 rounded-2xl shadow-lg">
                <label htmlFor="friendId" className="block text-lg font-medium mb-2 text-gray-300">Add a Friend by User ID</label>
                <div className="flex space-x-2">
                    <input id="friendId" type="text" value={newFriendId} onChange={(e) => setNewFriendId(e.target.value)} placeholder="Paste friend's User ID here" className="flex-grow bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none" required />
                    <button type="submit" disabled={isAdding} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center disabled:bg-blue-900 disabled:cursor-not-allowed">
                        {isAdding ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <UserPlus size={20} />}
                    </button>
                </div>
            </form>
            <div className="space-y-4">
                <h3 className="text-2xl font-semibold mb-4 text-gray-300">Members ({userData.circle.length})</h3>
                {userData.circle.length === 0 ? (
                    <p className="text-gray-400 text-center py-8 bg-gray-800 rounded-xl">Your circle is empty. Add friends to see their status.</p>
                ) : (
                    userData.circle.map(friend => (
                        <div key={friend.id} className="flex items-center justify-between bg-gray-800 p-4 rounded-lg shadow">
                            <div className="flex items-center space-x-4">
                                <StatusIcon status={circleStatuses[friend.id]} />
                                <div> 
                                    <p className="text-lg font-semibold text-white">{friend.name}</p> 
                                    <p className="text-xs text-gray-400">{friend.id}</p> 
                                </div>
                            </div>
                            <button onClick={() => handleRemoveFriend(friend.id)} className="text-red-400 hover:text-red-500 p-2 rounded-full hover:bg-gray-700 transition-colors"> <Trash2 size={20} /> </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

function ProfileView({ db, user, userData, onUpgrade, setCurrentView }) {
    const [displayName, setDisplayName] = useState(userData.displayName);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if(userData.displayName) {
            setDisplayName(userData.displayName);
        }
    }, [userData.displayName]);


    const handleSave = async (e) => {
        e.preventDefault();
        if (!displayName.trim() || !db || !user) return;
        setIsSaving(true);
        try {
            const userDocRef = doc(db, `/artifacts/${appId}/users/${user.uid}/private/profile`); // FIX: Updated path for saving profile data
            // START OF DEBUGGING ADDITION (Save Profile)
            console.log("DEBUG: Saving profile displayName to:", displayName.trim(), " for user:", user.uid, " at path:", userDocRef.path);
            // END OF DEBUGGING ADDITION
            await updateDoc(userDocRef, { displayName: displayName.trim() });
        }
        catch (error) { console.error("Error updating profile:", error); } 
        finally { setIsSaving(false); }
    };
    
    return (
        <div className="max-w-md mx-auto space-y-8">
            <h2 className="text-3xl font-bold text-center text-blue-300">My Profile</h2>
            <div className="p-6 bg-gray-800 rounded-2xl shadow-lg">
                 <div className="mb-6">
                    <h3 className="text-lg font-medium text-gray-300">My User ID</h3>
                    <div className="flex items-center space-x-2 mt-2 p-3 bg-gray-700 rounded-lg">
                        <p className="text-gray-200 truncate flex-grow">{user?.uid}</p>
                        <CopyButton textToCopy={user?.uid}/>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Share this ID with friends so they can add you.</p>
                </div>
                <form onSubmit={handleSave}>
                    <label htmlFor="displayName" className="block text-lg font-medium mb-2 text-gray-300">Display Name</label>
                    <input id="displayName" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"/>
                    <button type="submit" disabled={isSaving} className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center disabled:bg-blue-900">
                        {isSaving ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : 'Save Changes'}
                    </button>
                </form>
            </div>
            
             <div className="p-6 bg-gray-800 rounded-2xl shadow-lg">
                <button onClick={() => setCurrentView('privacy')} className="w-full text-center text-blue-400 hover:underline">
                    Security & Privacy Policy
                </button>
            </div>

            <div className="p-6 bg-gray-800 rounded-2xl shadow-lg text-center">
                 <h3 className="text-2xl font-bold mb-4 text-yellow-300">Premium Subscription</h3>
                 {userData.isPremium ? (
                    <div>
                        <CheckCircle className="mx-auto text-green-400 h-16 w-16 mb-4" />
                        <p className="text-lg text-gray-200">Your subscription is active. Thank you for your support!</p>
                    </div>
                 ) : (
                    <div>
                        <p className="text-gray-300 mb-4">Unlock advanced AI journaling, a live AI companion, expanded resources, and more.</p>
                        <button onClick={() => onUpgrade()} className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-6 rounded-lg transition-colors">
                            <Star size={20} />
                            <span>Upgrade for $2.99/month</span>
                        </button>
                    </div>
                 )}
            </div>
        </div>
    );
}

function PrivacyPolicyView({ setCurrentView }) {
    return (
        <div className="max-w-3xl mx-auto p-6 bg-gray-800 rounded-2xl shadow-lg text-gray-300">
            <button onClick={() => setCurrentView('profile')} className="flex items-center space-x-2 text-blue-400 hover:underline mb-6">
                <ArrowLeft size={20}/>
                <span>Back to Profile</span>
            </button>
            <div className="prose prose-invert max-w-none prose-h1:text-white prose-h3:text-teal-300 prose-strong:text-gray-100">
                <h1>Security & Privacy at Status Check</h1>
                <p>Your trust and privacy are the most important part of the Status Check app. This document explains in plain language how your data is protected.</p>
                
                <h3>Core Privacy Principle: You Control Your Data</h3>
                <p>Your personal data, including journal entries and private chats, belongs to you. The system is designed so that no one, not even the app administrators, can view your private content.</p>

                <h3>Data & Communications</h3>
                <ul>
                    <li><strong>Private Data (Journal, AI Companion Chat):</strong>
                        <ul>
                            <li>Your journal entries are stored in a protected area of the database that only your unique user account can access.</li>
                            <li>Your conversations with the AI Companion are <strong>ephemeral</strong>, meaning they are not stored in the database and disappear when you close the app. They are processed securely by the AI model but are not logged or saved.</li>
                        </ul>
                    </li>
                    <li><strong>Circle Communications (Alerts, Chat Requests):</strong>
                        <ul>
                            <li>When you send a "Crisis Alert" or a "Wellbeing Chat" request, it is not public. The notification is sent <em>only</em> to the specific User IDs that you have added to your support circle.</li>
                            <li>Random users or the public cannot search for or view these communications.</li>
                        </ul>
                    </li>
                </ul>

                <h3>Payment & Subscription Security</h3>
                <p>We use <strong>Stripe</strong>, a globally trusted and certified payment processor, to handle all subscription payments.</p>
                <ul>
                    <li><strong>We Never See Your Financial Information:</strong> When you subscribe to Premium, you enter your payment details into a secure form provided directly by Stripe.</li>
                    <li><strong>Your credit card number and other sensitive financial data are sent directly to Stripe's encrypted servers. They never touch or get stored on the Status Check app's servers or database.</strong></li>
                    <li>After a successful payment, Stripe simply tells our system that your account is now "Premium." We only store that status (`isPremium: true`), not any of your financial details.</li>
                </ul>
                <p>This is the industry-standard method for ensuring the highest level of security for online payments.</p>

                <h3>Anonymity & User Identity</h3>
                <ul>
                    <li>You can use the app without providing your real name, email, or any personally identifying information.</li>
                    <li>Your account is identified by a randomly generated, anonymous User ID.</li>
                    <li>You control what name is displayed to your circle members, and you can change it at any time.</li>
                </ul>

                <h3>Your Rights & Control</h3>
                <ul>
                    <li>You have the right to delete your account and all associated data at any time.</li>
                    <li>You control who is in your support circle and can add or remove members whenever you choose.</li>
                    </ul>
                <p>If you have any questions about our security practices, please don't hesitate to reach out.</p>
            </div>
        </div>
    );
}

function WellbeingChatRequester({ circle, addNotification, sendSystemNotification }) {
    const [selectedFriend, setSelectedFriend] = useState('');

    const handleRequest = async () => {
        if (!selectedFriend) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please select a friend.' }); return; }
        try {
            const friendName = circle.find(f => f.id === selectedFriend)?.name || 'A friend';
            const message = `would like to have a wellbeing chat.`;
            // START OF DEBUGGING ADDITION (Wellbeing Chat Request)
            console.log("DEBUG: Sending wellbeing chat request to:", selectedFriend, " message:", message);
            // END OF DEBUGGING ADDITION
            await sendSystemNotification(selectedFriend, message, 'wellbeing-request');
            addNotification({ id: Date.now().toString(), type: 'success', message: `Chat request sent to ${friendName}.` });
            setSelectedFriend('');
        } catch (error) { console.error("Error sending chat request:", error); addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not send chat request.' }); }
    };

    return (
        <div className="flex flex-col items-center justify-center h-full w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl mx-auto my-4">
            <h3 className="text-xl font-semibold mb-4 flex items-center"><Headphones className="mr-2 text-teal-300"/>Wellbeing Chat</h3>
            {circle.length === 0 ? ( <p className="text-gray-400">Add friends to your circle to request a chat.</p>
            ) : (
                <div className="space-y-4 w-full">
                    <select value={selectedFriend} onChange={e => setSelectedFriend(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="" disabled>Select a friend to call...</option>
                        {circle.map(friend => (<option key={friend.id} value={friend.id}>{friend.name}</option>))}
                    </select>
                    <button onClick={handleRequest} disabled={!selectedFriend} className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <Phone size={20}/>
                        <span>Request Chat</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function EnhancedStatusCheckSender({ circle, addNotification, sendSystemNotification }) {
    const [selectedFriend, setSelectedFriend] = useState('');
    const [messageTopic, setMessageTopic] = useState('');
    const [generatedMessage, setGeneratedMessage] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateMessage = async () => {
        if (!messageTopic.trim()) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please enter a topic for the message.' }); return; }
        setIsGenerating(true);
        setGeneratedMessage('');
        const prompt = `You are a caring friend. Based on the following theme, write one short, warm, and supportive check-in message (under 25 words) to send to a friend. Theme: '${messageTopic}'. Respond with only the message itself, without any extra text or quotation marks.`;
        const result = await generateGeminiContent(prompt);
        if (result) { setGeneratedMessage(result.trim()); } 
        else { addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not generate message. Try again.' }); }
        setIsGenerating(false);
    };

    const handleSend = async () => {
        if (!selectedFriend) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please select a friend.' }); return; }
        if (!generatedMessage.trim()) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please generate a message first.' }); return; }
        try {
            // START OF DEBUGGING ADDITION (Enhanced Status Check Send)
            console.log("DEBUG: Sending enhanced status check to:", selectedFriend, " message:", generatedMessage);
            // END OF DEBUGGING ADDITION
            await sendSystemNotification(selectedFriend, generatedMessage, 'check-in');
            addNotification({ id: Date.now().toString(), type: 'success', message: 'Status check sent!' });
            setSelectedFriend(''); setMessageTopic(''); setGeneratedMessage('');
        } catch (error) { console.error("Error sending status check:", error); addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not send status check.' }); }
    };
    
    return (
        <div className="flex flex-col items-center justify-center h-full w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl mx-auto my-4">
            <h3 className="text-xl font-semibold mb-4 flex items-center"><Sparkles className="mr-2 text-yellow-300"/>AI-Assisted Status Check</h3>
            {circle.length === 0 ? ( <p className="text-gray-400">Add friends to your circle to send them a status check.</p>
            ) : (
                <div className="space-y-4 w-full">
                    <select value={selectedFriend} onChange={e => setSelectedFriend(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="" disabled>1. Select a friend...</option>
                        {circle.map(friend => (<option key={friend.id} value={friend.id}>{friend.name}</option>))}
                    </select>
                    <div className="flex space-x-2 w-full">
                        <input type="text" value={messageTopic} onChange={e => setMessageTopic(e.target.value)} placeholder="2. Message topic (e.g., 'gentle check-in')" className="flex-grow bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                        <button onClick={handleGenerateMessage} disabled={isGenerating} className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center disabled:bg-yellow-800">
                             {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div> : <Sparkles size={20}/>}
                        </button>
                    </div>
                    {generatedMessage && ( <div className="bg-gray-700 p-3 rounded-lg w-full"> <p className="text-gray-300 italic">"{generatedMessage}"</p> </div> )}
                    <button onClick={handleSend} disabled={!generatedMessage || !selectedFriend} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <Send size={20}/>
                        <span>3. Send Message</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function CrisisModal({ alert, onRespond }) {
    const [guidance, setGuidance] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateGuidance = async () => {
        setIsGenerating(true);
        setGuidance('');
        const prompt = "A friend has sent a crisis alert indicating they are experiencing extreme distress, possibly a PTSD episode. As a mental health first aid expert, provide 3 brief, actionable tips for the person who is about to respond. The tips should be supportive, non-judgemental, and focus on immediate de-escalation and safety. Start with 'Remember:'.";
        const result = await generateGeminiContent(prompt);
        if (result) { setGuidance(result); } 
        else { setGuidance("Could not load tips. Focus on listening and showing you care."); }
        setIsGenerating(false);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-red-900 border-4 border-red-500 rounded-2xl p-8 max-w-lg w-full text-center shadow-2xl animate-pulse-intense">
                <AlertTriangle className="mx-auto text-red-300 h-24 w-24 mb-4" />
                <h2 className="text-4xl font-extrabold text-white mb-2">CRISIS ALERT</h2>
                <p className="text-2xl text-red-200 mb-6"> <span className="font-bold">{alert.fromUser.name}</span> needs help now. </p>
                <button onClick={() => onRespond(alert)} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-8 rounded-lg text-2xl transition-transform transform hover:scale-105"> I Can Help </button>
                <div className="mt-6">
                    <button onClick={handleGenerateGuidance} disabled={isGenerating} className="text-sm text-indigo-200 hover:text-white bg-indigo-800/50 hover:bg-indigo-700/50 font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 w-full">
                        {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <> <BrainCircuit size={16}/> <span>How to Help</span> </>}
                    </button>
                    {guidance && <div className="text-left text-sm mt-3 text-indigo-100 bg-black/20 p-3 rounded-md">{guidance}</div>}
                </div>
            </div>
        </div>
    );
}

function ActiveAlertCard({ alert, onCancel, addNotification }) {
    const [groundingExercise, setGroundingExercise] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateExercise = async () => {
        setIsGenerating(true); setGroundingExercise('');
        const prompt = "You are an expert in mindfulness. Generate a simple grounding exercise for someone in intense anxiety. It must be short, easy, and focus on the senses. Use simple numbered steps. Do not include a preamble.";
        const result = await generateGeminiContent(prompt);
        if (result) { setGroundingExercise(result); } 
        else { addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not generate exercise.' }); }
        setIsGenerating(false);
    };

    return (
        <div className="w-full p-6 bg-gray-800 rounded-2xl shadow-xl border-2 border-yellow-500 text-center space-y-4">
            <div>
                <div className="animate-pulse flex justify-center items-center text-yellow-400 mb-2"> <AlertTriangle size={24} className="mr-2"/> <p className="font-bold">ALERT SENT</p> </div>
                <p className="text-lg text-gray-300"> Your circle has been notified. </p>
                {alert.status === 'acknowledged' && ( <div className="bg-green-800/50 p-3 rounded-lg mt-4"> <p className="font-bold text-green-300">{alert.responder.name} is responding!</p> </div> )}
            </div>
            <div className="bg-gray-700/50 p-4 rounded-lg">
                <button onClick={handleGenerateExercise} disabled={isGenerating} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-indigo-900">
                    {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <> <BrainCircuit size={16}/> <span>Show a Calming Exercise</span> </>}
                    </button>
                {groundingExercise && ( <div className="text-left text-sm mt-4 text-indigo-100 bg-black/20 p-3 rounded-md">{groundingExercise}</div> )}
            </div>
            <button onClick={() => onCancel()} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors"> I'm OK Now (Cancel Alert) </button>
        </div>
    );
}

function DailyStatusSelector({ currentStatus, onStatusChange }) {
    const statuses = [
        { id: 'good', label: 'Feeling Good', icon: <Smile/>, color: 'border-green-500', selectedColor: 'bg-green-500 text-white' },
        { id: 'uneasy', label: 'Uneasy', icon: <Meh/>, color: 'border-yellow-500', selectedColor: 'bg-yellow-500 text-black' },
        { id: 'struggling', label: 'Struggling', icon: <Frown/>, color: 'border-red-500', selectedColor: 'bg-red-500 text-white' },
    ];
    return (
        <div className="w-full max-w-md p-4 bg-gray-800 rounded-2xl shadow-xl">
            <h3 className="text-lg font-semibold text-center mb-3 text-gray-300">How are you today?</h3>
            <div className="flex justify-around">
                {statuses.map(s => (
                    <button key={s.id} onClick={() => onStatusChange(s.id)} 
                    className={`flex items-center space-x-2 py-2 px-4 border-2 rounded-lg transition-colors ${currentStatus === s.id ? s.selectedColor : `bg-gray-700 hover:bg-gray-600 ${s.color}`}`}>
                        {s.icon} <span className="hidden sm:inline">{s.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}


function AICompanionView({ isPremium, setCurrentView, addNotification }) {
    const [messages, setMessages] = useState([]);
    const [userInput, setUserInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const chatEndRef = useRef(null);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    useEffect(scrollToBottom, [messages]);
    
    useEffect(() => {
        if(isPremium) {
            setMessages([{role: 'model', parts: [{text: "Hello, I'm your private AI Companion. I'm here to listen and support you. How are you feeling right now?"}]}]);
        }
    }, [isPremium]);

    if (!isPremium) {
        return <PremiumLock setCurrentView={setCurrentView} />;
    }

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading) return;
        
        const newHistory = [...messages, { role: 'user', parts: [{text: userInput}]}];
        setMessages(newHistory);
        setUserInput('');
        setIsLoading(true);

        const systemPrompt = "You are a calm, supportive, and empathetic AI companion. Your user is seeking a safe space to talk about their feelings, potentially related to PTSD or high stress. Your primary goals are: 1. Listen actively and validate their feelings without judgment. 2. If they express severe distress, gently guide them to use the app's 'Crisis Alert' feature or contact a professional resource from the 'Resources' tab. 3. Do NOT provide medical advice. 4. Keep responses concise and caring. Start your response now."
        const responseText = await generateGeminiContent(`${systemPrompt}\n\nMy current thought: ${userInput}`, newHistory);
        
        if (responseText) {
            setMessages(prev => [...prev, {role: 'model', parts: [{text: responseText}]}]);
        } else {
            addNotification({id: Date.now().toString(), type: 'error', message: "I'm having a little trouble connecting right now. Please try again in a moment."});
            setMessages(prev => prev.slice(0, -1)); // remove the user's message if AI fails
        }
        setIsLoading(false);
    };

    return (
        <div className="flex flex-col items-center justify-center h-full w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl mx-auto my-4">
            <h3 className="text-xl font-semibold mb-4 flex items-center"><Headphones className="mr-2 text-teal-300"/>Wellbeing Chat</h3>
            {circle.length === 0 ? ( <p className="text-gray-400">Add friends to your circle to request a chat.</p>
            ) : (
                <div className="space-y-4 w-full">
                    <select value={selectedFriend} onChange={e => setSelectedFriend(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="" disabled>Select a friend to call...</option>
                        {circle.map(friend => (<option key={friend.id} value={friend.id}>{friend.name}</option>))}
                    </select>
                    <button onClick={handleRequest} disabled={!selectedFriend} className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <Phone size={20}/>
                        <span>Request Chat</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function EnhancedStatusCheckSender({ circle, addNotification, sendSystemNotification }) {
    const [selectedFriend, setSelectedFriend] = useState('');
    const [messageTopic, setMessageTopic] = useState('');
    const [generatedMessage, setGeneratedMessage] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateMessage = async () => {
        if (!messageTopic.trim()) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please enter a topic for the message.' }); return; }
        setIsGenerating(true);
        setGeneratedMessage('');
        const prompt = `You are a caring friend. Based on the following theme, write one short, warm, and supportive check-in message (under 25 words) to send to a friend. Theme: '${messageTopic}'. Respond with only the message itself, without any extra text or quotation marks.`;
        const result = await generateGeminiContent(prompt);
        if (result) { setGeneratedMessage(result.trim()); } 
        else { addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not generate message. Try again.' }); }
        setIsGenerating(false);
    };

    const handleSend = async () => {
        if (!selectedFriend) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please select a friend.' }); return; }
        if (!generatedMessage.trim()) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please generate a message first.' }); return; }
        try {
            // START OF DEBUGGING ADDITION (Enhanced Status Check Send)
            console.log("DEBUG: Sending enhanced status check to:", selectedFriend, " message:", generatedMessage);
            // END OF DEBUGGING ADDITION
            await sendSystemNotification(selectedFriend, generatedMessage, 'check-in');
            addNotification({ id: Date.now().toString(), type: 'success', message: 'Status check sent!' });
            setSelectedFriend(''); setMessageTopic(''); setGeneratedMessage('');
        } catch (error) { console.error("Error sending status check:", error); addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not send status check.' }); }
    };
    
    return (
        <div className="flex flex-col items-center justify-center h-full w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl mx-auto my-4">
            <h3 className="text-xl font-semibold mb-4 flex items-center"><Sparkles className="mr-2 text-yellow-300"/>AI-Assisted Status Check</h3>
            {circle.length === 0 ? ( <p className="text-gray-400">Add friends to your circle to send them a status check.</p>
            ) : (
                <div className="space-y-4 w-full">
                    <select value={selectedFriend} onChange={e => setSelectedFriend(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="" disabled>1. Select a friend...</option>
                        {circle.map(friend => (<option key={friend.id} value={friend.id}>{friend.name}</option>))}
                    </select>
                    <div className="flex space-x-2 w-full">
                        <input type="text" value={messageTopic} onChange={e => setMessageTopic(e.target.value)} placeholder="2. Message topic (e.g., 'gentle check-in')" className="flex-grow bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                        <button onClick={handleGenerateMessage} disabled={isGenerating} className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center disabled:bg-yellow-800">
                             {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div> : <Sparkles size={20}/>}
                        </button>
                    </div>
                    {generatedMessage && ( <div className="bg-gray-700 p-3 rounded-lg w-full"> <p className="text-gray-300 italic">"{generatedMessage}"</p> </div> )}
                    <button onClick={handleSend} disabled={!generatedMessage || !selectedFriend} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <Send size={20}/>
                        <span>3. Send Message</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function CrisisModal({ alert, onRespond }) {
    const [guidance, setGuidance] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateGuidance = async () => {
        setIsGenerating(true);
        setGuidance('');
        const prompt = "A friend has sent a crisis alert indicating they are experiencing extreme distress, possibly a PTSD episode. As a mental health first aid expert, provide 3 brief, actionable tips for the person who is about to respond. The tips should be supportive, non-judgemental, and focus on immediate de-escalation and safety. Start with 'Remember:'.";
        const result = await generateGeminiContent(prompt);
        if (result) { setGuidance(result); } 
        else { setGuidance("Could not load tips. Focus on listening and showing you care."); }
        setIsGenerating(false);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-red-900 border-4 border-red-500 rounded-2xl p-8 max-w-lg w-full text-center shadow-2xl animate-pulse-intense">
                <AlertTriangle className="mx-auto text-red-300 h-24 w-24 mb-4" />
                <h2 className="text-4xl font-extrabold text-white mb-2">CRISIS ALERT</h2>
                <p className="text-2xl text-red-200 mb-6"> <span className="font-bold">{alert.fromUser.name}</span> needs help now. </p>
                <button onClick={() => onRespond(alert)} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-8 rounded-lg text-2xl transition-transform transform hover:scale-105"> I Can Help </button>
                <div className="mt-6">
                    <button onClick={handleGenerateGuidance} disabled={isGenerating} className="text-sm text-indigo-200 hover:text-white bg-indigo-800/50 hover:bg-indigo-700/50 font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 w-full">
                        {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <> <BrainCircuit size={16}/> <span>How to Help</span> </>}
                    </button>
                    {guidance && <div className="text-left text-sm mt-3 text-indigo-100 bg-black/20 p-3 rounded-md">{guidance}</div>}
                </div>
            </div>
        </div>
    );
}

function ActiveAlertCard({ alert, onCancel, addNotification }) {
    const [groundingExercise, setGroundingExercise] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateExercise = async () => {
        setIsGenerating(true); setGroundingExercise('');
        const prompt = "You are an expert in mindfulness. Generate a simple grounding exercise for someone in intense anxiety. It must be short, easy, and focus on the senses. Use simple numbered steps. Do not include a preamble.";
        const result = await generateGeminiContent(prompt);
        if (result) { setGroundingExercise(result); } 
        else { addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not generate exercise.' }); }
        setIsGenerating(false);
    };

    return (
        <div className="w-full p-6 bg-gray-800 rounded-2xl shadow-xl border-2 border-yellow-500 text-center space-y-4">
            <div>
                <div className="animate-pulse flex justify-center items-center text-yellow-400 mb-2"> <AlertTriangle size={24} className="mr-2"/> <p className="font-bold">ALERT SENT</p> </div>
                <p className="text-lg text-gray-300"> Your circle has been notified. </p>
                {alert.status === 'acknowledged' && ( <div className="bg-green-800/50 p-3 rounded-lg mt-4"> <p className="font-bold text-green-300">{alert.responder.name} is responding!</p> </div> )}
            </div>
            <div className="bg-gray-700/50 p-4 rounded-lg">
                <button onClick={handleGenerateExercise} disabled={isGenerating} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-indigo-900">
                    {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <> <BrainCircuit size={16}/> <span>Show a Calming Exercise</span> </>}
                    </button>
                {groundingExercise && ( <div className="text-left text-sm mt-4 text-indigo-100 bg-black/20 p-3 rounded-md">{groundingExercise}</div> )}
            </div>
            <button onClick={() => onCancel()} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors"> I'm OK Now (Cancel Alert) </button>
        </div>
    );
}

function DailyStatusSelector({ currentStatus, onStatusChange }) {
    const statuses = [
        { id: 'good', label: 'Feeling Good', icon: <Smile/>, color: 'border-green-500', selectedColor: 'bg-green-500 text-white' },
        { id: 'uneasy', label: 'Uneasy', icon: <Meh/>, color: 'border-yellow-500', selectedColor: 'bg-yellow-500 text-black' },
        { id: 'struggling', label: 'Struggling', icon: <Frown/>, color: 'border-red-500', selectedColor: 'bg-red-500 text-white' },
    ];
    return (
        <div className="w-full max-w-md p-4 bg-gray-800 rounded-2xl shadow-xl">
            <h3 className="text-lg font-semibold text-center mb-3 text-gray-300">How are you today?</h3>
            <div className="flex justify-around">
                {statuses.map(s => (
                    <button key={s.id} onClick={() => onStatusChange(s.id)} 
                    className={`flex items-center space-x-2 py-2 px-4 border-2 rounded-lg transition-colors ${currentStatus === s.id ? s.selectedColor : `bg-gray-700 hover:bg-gray-600 ${s.color}`}`}>
                        {s.icon} <span className="hidden sm:inline">{s.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}


function AICompanionView({ isPremium, setCurrentView, addNotification }) {
    const [messages, setMessages] = useState([]);
    const [userInput, setUserInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const chatEndRef = useRef(null);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    useEffect(scrollToBottom, [messages]);
    
    useEffect(() => {
        if(isPremium) {
            setMessages([{role: 'model', parts: [{text: "Hello, I'm your private AI Companion. I'm here to listen and support you. How are you feeling right now?"}]}]);
        }
    }, [isPremium]);

    if (!isPremium) {
        return <PremiumLock setCurrentView={setCurrentView} />;
    }

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading) return;
        
        const newHistory = [...messages, { role: 'user', parts: [{text: userInput}]}];
        setMessages(newHistory);
        setUserInput('');
        setIsLoading(true);

        const systemPrompt = "You are a calm, supportive, and empathetic AI companion. Your user is seeking a safe space to talk about their feelings, potentially related to PTSD or high stress. Your primary goals are: 1. Listen actively and validate their feelings without judgment. 2. If they express severe distress, gently guide them to use the app's 'Crisis Alert' feature or contact a professional resource from the 'Resources' tab. 3. Do NOT provide medical advice. 4. Keep responses concise and caring. Start your response now."
        const responseText = await generateGeminiContent(`${systemPrompt}\n\nMy current thought: ${userInput}`, newHistory);
        
        if (responseText) {
            setMessages(prev => [...prev, {role: 'model', parts: [{text: responseText}]}]);
        } else {
            addNotification({id: Date.now().toString(), type: 'error', message: "I'm having a little trouble connecting right now. Please try again in a moment."});
            setMessages(prev => prev.slice(0, -1)); // remove the user's message if AI fails
        }
        setIsLoading(false);
    };

    return (
        <div className="flex flex-col items-center justify-center h-full w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl mx-auto my-4">
            <h3 className="text-xl font-semibold mb-4 flex items-center"><Headphones className="mr-2 text-teal-300"/>Wellbeing Chat</h3>
            {circle.length === 0 ? ( <p className="text-gray-400">Add friends to your circle to request a chat.</p>
            ) : (
                <div className="space-y-4 w-full">
                    <select value={selectedFriend} onChange={e => setSelectedFriend(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="" disabled>Select a friend to call...</option>
                        {circle.map(friend => (<option key={friend.id} value={friend.id}>{friend.name}</option>))}
                    </select>
                    <button onClick={handleRequest} disabled={!selectedFriend} className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <Phone size={20}/>
                        <span>Request Chat</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function EnhancedStatusCheckSender({ circle, addNotification, sendSystemNotification }) {
    const [selectedFriend, setSelectedFriend] = useState('');
    const [messageTopic, setMessageTopic] = useState('');
    const [generatedMessage, setGeneratedMessage] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateMessage = async () => {
        if (!messageTopic.trim()) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please enter a topic for the message.' }); return; }
        setIsGenerating(true);
        setGeneratedMessage('');
        const prompt = `You are a caring friend. Based on the following theme, write one short, warm, and supportive check-in message (under 25 words) to send to a friend. Theme: '${messageTopic}'. Respond with only the message itself, without any extra text or quotation marks.`;
        const result = await generateGeminiContent(prompt);
        if (result) { setGeneratedMessage(result.trim()); } 
        else { addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not generate message. Try again.' }); }
        setIsGenerating(false);
    };

    const handleSend = async () => {
        if (!selectedFriend) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please select a friend.' }); return; }
        if (!generatedMessage.trim()) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please generate a message first.' }); return; }
        try {
            // START OF DEBUGGING ADDITION (Enhanced Status Check Send)
            console.log("DEBUG: Sending enhanced status check to:", selectedFriend, " message:", generatedMessage);
            // END OF DEBUGGING ADDITION
            await sendSystemNotification(selectedFriend, generatedMessage, 'check-in');
            addNotification({ id: Date.now().toString(), type: 'success', message: 'Status check sent!' });
            setSelectedFriend(''); setMessageTopic(''); setGeneratedMessage('');
        } catch (error) { console.error("Error sending status check:", error); addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not send status check.' }); }
    };
    
    return (
        <div className="flex flex-col items-center justify-center h-full w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl mx-auto my-4">
            <h3 className="text-xl font-semibold mb-4 flex items-center"><Sparkles className="mr-2 text-yellow-300"/>AI-Assisted Status Check</h3>
            {circle.length === 0 ? ( <p className="text-gray-400">Add friends to your circle to send them a status check.</p>
            ) : (
                <div className="space-y-4 w-full">
                    <select value={selectedFriend} onChange={e => setSelectedFriend(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="" disabled>1. Select a friend...</option>
                        {circle.map(friend => (<option key={friend.id} value={friend.id}>{friend.name}</option>))}
                    </select>
                    <div className="flex space-x-2 w-full">
                        <input type="text" value={messageTopic} onChange={e => setMessageTopic(e.target.value)} placeholder="2. Message topic (e.g., 'gentle check-in')" className="flex-grow bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                        <button onClick={handleGenerateMessage} disabled={isGenerating} className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center disabled:bg-yellow-800">
                             {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div> : <Sparkles size={20}/>}
                        </button>
                    </div>
                    {generatedMessage && ( <div className="bg-gray-700 p-3 rounded-lg w-full"> <p className="text-gray-300 italic">"{generatedMessage}"</p> </div> )}
                    <button onClick={handleSend} disabled={!generatedMessage || !selectedFriend} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <Send size={20}/>
                        <span>3. Send Message</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function CrisisModal({ alert, onRespond }) {
    const [guidance, setGuidance] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateGuidance = async () => {
        setIsGenerating(true);
        setGuidance('');
        const prompt = "A friend has sent a crisis alert indicating they are experiencing extreme distress, possibly a PTSD episode. As a mental health first aid expert, provide 3 brief, actionable tips for the person who is about to respond. The tips should be supportive, non-judgemental, and focus on immediate de-escalation and safety. Start with 'Remember:'.";
        const result = await generateGeminiContent(prompt);
        if (result) { setGuidance(result); } 
        else { setGuidance("Could not load tips. Focus on listening and showing you care."); }
        setIsGenerating(false);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-red-900 border-4 border-red-500 rounded-2xl p-8 max-w-lg w-full text-center shadow-2xl animate-pulse-intense">
                <AlertTriangle className="mx-auto text-red-300 h-24 w-24 mb-4" />
                <h2 className="text-4xl font-extrabold text-white mb-2">CRISIS ALERT</h2>
                <p className="text-2xl text-red-200 mb-6"> <span className="font-bold">{alert.fromUser.name}</span> needs help now. </p>
                <button onClick={() => onRespond(alert)} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-8 rounded-lg text-2xl transition-transform transform hover:scale-105"> I Can Help </button>
                <div className="mt-6">
                    <button onClick={handleGenerateGuidance} disabled={isGenerating} className="text-sm text-indigo-200 hover:text-white bg-indigo-800/50 hover:bg-indigo-700/50 font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 w-full">
                        {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <> <BrainCircuit size={16}/> <span>How to Help</span> </>}
                    </button>
                    {guidance && <div className="text-left text-sm mt-3 text-indigo-100 bg-black/20 p-3 rounded-md">{guidance}</div>}
                </div>
            </div>
        </div>
    );
}

function ActiveAlertCard({ alert, onCancel, addNotification }) {
    const [groundingExercise, setGroundingExercise] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateExercise = async () => {
        setIsGenerating(true); setGroundingExercise('');
        const prompt = "You are an expert in mindfulness. Generate a simple grounding exercise for someone in intense anxiety. It must be short, easy, and focus on the senses. Use simple numbered steps. Do not include a preamble.";
        const result = await generateGeminiContent(prompt);
        if (result) { setGroundingExercise(result); } 
        else { addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not generate exercise.' }); }
        setIsGenerating(false);
    };

    return (
        <div className="w-full p-6 bg-gray-800 rounded-2xl shadow-xl border-2 border-yellow-500 text-center space-y-4">
            <div>
                <div className="animate-pulse flex justify-center items-center text-yellow-400 mb-2"> <AlertTriangle size={24} className="mr-2"/> <p className="font-bold">ALERT SENT</p> </div>
                <p className="text-lg text-gray-300"> Your circle has been notified. </p>
                {alert.status === 'acknowledged' && ( <div className="bg-green-800/50 p-3 rounded-lg mt-4"> <p className="font-bold text-green-300">{alert.responder.name} is responding!</p> </div> )}
            </div>
            <div className="bg-gray-700/50 p-4 rounded-lg">
                <button onClick={handleGenerateExercise} disabled={isGenerating} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-indigo-900">
                    {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <> <BrainCircuit size={16}/> <span>Show a Calming Exercise</span> </>}
                    </button>
                {groundingExercise && ( <div className="text-left text-sm mt-4 text-indigo-100 bg-black/20 p-3 rounded-md">{groundingExercise}</div> )}
            </div>
            <button onClick={() => onCancel()} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors"> I'm OK Now (Cancel Alert) </button>
        </div>
    );
}

function DailyStatusSelector({ currentStatus, onStatusChange }) {
    const statuses = [
        { id: 'good', label: 'Feeling Good', icon: <Smile/>, color: 'border-green-500', selectedColor: 'bg-green-500 text-white' },
        { id: 'uneasy', label: 'Uneasy', icon: <Meh/>, color: 'border-yellow-500', selectedColor: 'bg-yellow-500 text-black' },
        { id: 'struggling', label: 'Struggling', icon: <Frown/>, color: 'border-red-500', selectedColor: 'bg-red-500 text-white' },
    ];
    return (
        <div className="w-full max-w-md p-4 bg-gray-800 rounded-2xl shadow-xl">
            <h3 className="text-lg font-semibold text-center mb-3 text-gray-300">How are you today?</h3>
            <div className="flex justify-around">
                {statuses.map(s => (
                    <button key={s.id} onClick={() => onStatusChange(s.id)} 
                    className={`flex items-center space-x-2 py-2 px-4 border-2 rounded-lg transition-colors ${currentStatus === s.id ? s.selectedColor : `bg-gray-700 hover:bg-gray-600 ${s.color}`}`}>
                        {s.icon} <span className="hidden sm:inline">{s.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}


function AICompanionView({ isPremium, setCurrentView, addNotification }) {
    const [messages, setMessages] = useState([]);
    const [userInput, setUserInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const chatEndRef = useRef(null);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    useEffect(scrollToBottom, [messages]);
    
    useEffect(() => {
        if(isPremium) {
            setMessages([{role: 'model', parts: [{text: "Hello, I'm your private AI Companion. I'm here to listen and support you. How are you feeling right now?"}]}]);
        }
    }, [isPremium]);

    if (!isPremium) {
        return <PremiumLock setCurrentView={setCurrentView} />;
    }

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading) return;
        
        const newHistory = [...messages, { role: 'user', parts: [{text: userInput}]}];
        setMessages(newHistory);
        setUserInput('');
        setIsLoading(true);

        const systemPrompt = "You are a calm, supportive, and empathetic AI companion. Your user is seeking a safe space to talk about their feelings, potentially related to PTSD or high stress. Your primary goals are: 1. Listen actively and validate their feelings without judgment. 2. If they express severe distress, gently guide them to use the app's 'Crisis Alert' feature or contact a professional resource from the 'Resources' tab. 3. Do NOT provide medical advice. 4. Keep responses concise and caring. Start your response now."
        const responseText = await generateGeminiContent(`${systemPrompt}\n\nMy current thought: ${userInput}`, newHistory);
        
        if (responseText) {
            setMessages(prev => [...prev, {role: 'model', parts: [{text: responseText}]}]);
        } else {
            addNotification({id: Date.now().toString(), type: 'error', message: "I'm having a little trouble connecting right now. Please try again in a moment."});
            setMessages(prev => prev.slice(0, -1)); // remove the user's message if AI fails
        }
        setIsLoading(false);
    };

    return (
        <div className="flex flex-col items-center justify-center h-full w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl mx-auto my-4">
            <h3 className="text-xl font-semibold mb-4 flex items-center"><Headphones className="mr-2 text-teal-300"/>Wellbeing Chat</h3>
            {circle.length === 0 ? ( <p className="text-gray-400">Add friends to your circle to request a chat.</p>
            ) : (
                <div className="space-y-4 w-full">
                    <select value={selectedFriend} onChange={e => setSelectedFriend(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="" disabled>Select a friend to call...</option>
                        {circle.map(friend => (<option key={friend.id} value={friend.id}>{friend.name}</option>))}
                    </select>
                    <button onClick={handleRequest} disabled={!selectedFriend} className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <Phone size={20}/>
                        <span>Request Chat</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function EnhancedStatusCheckSender({ circle, addNotification, sendSystemNotification }) {
    const [selectedFriend, setSelectedFriend] = useState('');
    const [messageTopic, setMessageTopic] = useState('');
    const [generatedMessage, setGeneratedMessage] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateMessage = async () => {
        if (!messageTopic.trim()) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please enter a topic for the message.' }); return; }
        setIsGenerating(true);
        setGeneratedMessage('');
        const prompt = `You are a caring friend. Based on the following theme, write one short, warm, and supportive check-in message (under 25 words) to send to a friend. Theme: '${messageTopic}'. Respond with only the message itself, without any extra text or quotation marks.`;
        const result = await generateGeminiContent(prompt);
        if (result) { setGeneratedMessage(result.trim()); } 
        else { addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not generate message. Try again.' }); }
        setIsGenerating(false);
    };

    const handleSend = async () => {
        if (!selectedFriend) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please select a friend.' }); return; }
        if (!generatedMessage.trim()) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please generate a message first.' }); return; }
        try {
            // START OF DEBUGGING ADDITION (Enhanced Status Check Send)
            console.log("DEBUG: Sending enhanced status check to:", selectedFriend, " message:", generatedMessage);
            // END OF DEBUGGING ADDITION
            await sendSystemNotification(selectedFriend, generatedMessage, 'check-in');
            addNotification({ id: Date.now().toString(), type: 'success', message: 'Status check sent!' });
            setSelectedFriend(''); setMessageTopic(''); setGeneratedMessage('');
        } catch (error) { console.error("Error sending status check:", error); addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not send status check.' }); }
    };
    
    return (
        <div className="flex flex-col items-center justify-center h-full w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl mx-auto my-4">
            <h3 className="text-xl font-semibold mb-4 flex items-center"><Sparkles className="mr-2 text-yellow-300"/>AI-Assisted Status Check</h3>
            {circle.length === 0 ? ( <p className="text-gray-400">Add friends to your circle to send them a status check.</p>
            ) : (
                <div className="space-y-4 w-full">
                    <select value={selectedFriend} onChange={e => setSelectedFriend(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="" disabled>Select a friend...</option>
                        {circle.map(friend => (<option key={friend.id} value={friend.id}>{friend.name}</option>))}
                    </select>
                    <div className="flex space-x-2 w-full">
                        <input type="text" value={messageTopic} onChange={e => setMessageTopic(e.target.value)} placeholder="2. Message topic (e.g., 'gentle check-in')" className="flex-grow bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                        <button onClick={handleGenerateMessage} disabled={isGenerating} className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center disabled:bg-yellow-800">
                             {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div> : <Sparkles size={20}/>}
                        </button>
                    </div>
                    {generatedMessage && ( <div className="bg-gray-700 p-3 rounded-lg w-full"> <p className="text-gray-300 italic">"{generatedMessage}"</p> </div> )}
                    <button onClick={handleSend} disabled={!generatedMessage || !selectedFriend} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <Send size={20}/>
                        <span>3. Send Message</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function CrisisModal({ alert, onRespond }) {
    const [guidance, setGuidance] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateGuidance = async () => {
        setIsGenerating(true);
        setGuidance('');
        const prompt = "A friend has sent a crisis alert indicating they are experiencing extreme distress, possibly a PTSD episode. As a mental health first aid expert, provide 3 brief, actionable tips for the person who is about to respond. The tips should be supportive, non-judgemental, and focus on immediate de-escalation and safety. Start with 'Remember:'.";
        const result = await generateGeminiContent(prompt);
        if (result) { setGuidance(result); } 
        else { setGuidance("Could not load tips. Focus on listening and showing you care."); }
        setIsGenerating(false);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-red-900 border-4 border-red-500 rounded-2xl p-8 max-w-lg w-full text-center shadow-2xl animate-pulse-intense">
                <AlertTriangle className="mx-auto text-red-300 h-24 w-24 mb-4" />
                <h2 className="text-4xl font-extrabold text-white mb-2">CRISIS ALERT</h2>
                <p className="text-2xl text-red-200 mb-6"> <span className="font-bold">{alert.fromUser.name}</span> needs help now. </p>
                <button onClick={() => onRespond(alert)} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-8 rounded-lg text-2xl transition-transform transform hover:scale-105"> I Can Help </button>
                <div className="mt-6">
                    <button onClick={handleGenerateGuidance} disabled={isGenerating} className="text-sm text-indigo-200 hover:text-white bg-indigo-800/50 hover:bg-indigo-700/50 font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 w-full">
                        {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <> <BrainCircuit size={16}/> <span>How to Help</span> </>}
                    </button>
                    {guidance && <div className="text-left text-sm mt-3 text-indigo-100 bg-black/20 p-3 rounded-md">{guidance}</div>}
                </div>
            </div>
        </div>
    );
}

function ActiveAlertCard({ alert, onCancel, addNotification }) {
    const [groundingExercise, setGroundingExercise] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateExercise = async () => {
        setIsGenerating(true); setGroundingExercise('');
        const prompt = "You are an expert in mindfulness. Generate a simple grounding exercise for someone in intense anxiety. It must be short, easy, and focus on the senses. Use simple numbered steps. Do not include a preamble.";
        const result = await generateGeminiContent(prompt);
        if (result) { setGroundingExercise(result); } 
        else { addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not generate exercise.' }); }
        setIsGenerating(false);
    };

    return (
        <div className="w-full p-6 bg-gray-800 rounded-2xl shadow-xl border-2 border-yellow-500 text-center space-y-4">
            <div>
                <div className="animate-pulse flex justify-center items-center text-yellow-400 mb-2"> <AlertTriangle size={24} className="mr-2"/> <p className="font-bold">ALERT SENT</p> </div>
                <p className="text-lg text-gray-300"> Your circle has been notified. </p>
                {alert.status === 'acknowledged' && ( <div className="bg-green-800/50 p-3 rounded-lg mt-4"> <p className="font-bold text-green-300">{alert.responder.name} is responding!</p> </div> )}
            </div>
            <div className="bg-gray-700/50 p-4 rounded-lg">
                <button onClick={handleGenerateExercise} disabled={isGenerating} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-indigo-900">
                    {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <> <BrainCircuit size={16}/> <span>Show a Calming Exercise</span> </>}
                    </button>
                {groundingExercise && ( <div className="text-left text-sm mt-4 text-indigo-100 bg-black/20 p-3 rounded-md">{groundingExercise}</div> )}
            </div>
            <button onClick={() => onCancel()} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors"> I'm OK Now (Cancel Alert) </button>
        </div>
    );
}

function DailyStatusSelector({ currentStatus, onStatusChange }) {
    const statuses = [
        { id: 'good', label: 'Feeling Good', icon: <Smile/>, color: 'border-green-500', selectedColor: 'bg-green-500 text-white' },
        { id: 'uneasy', label: 'Uneasy', icon: <Meh/>, color: 'border-yellow-500', selectedColor: 'bg-yellow-500 text-black' },
        { id: 'struggling', label: 'Struggling', icon: <Frown/>, color: 'border-red-500', selectedColor: 'bg-red-500 text-white' },
    ];
    return (
        <div className="w-full max-w-md p-4 bg-gray-800 rounded-2xl shadow-xl">
            <h3 className="text-lg font-semibold text-center mb-3 text-gray-300">How are you today?</h3>
            <div className="flex justify-around">
                {statuses.map(s => (
                    <button key={s.id} onClick={() => onStatusChange(s.id)} 
                    className={`flex items-center space-x-2 py-2 px-4 border-2 rounded-lg transition-colors ${currentStatus === s.id ? s.selectedColor : `bg-gray-700 hover:bg-gray-600 ${s.color}`}`}>
                        {s.icon} <span className="hidden sm:inline">{s.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}


function AICompanionView({ isPremium, setCurrentView, addNotification }) {
    const [messages, setMessages] = useState([]);
    const [userInput, setUserInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const chatEndRef = useRef(null);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    useEffect(scrollToBottom, [messages]);
    
    useEffect(() => {
        if(isPremium) {
            setMessages([{role: 'model', parts: [{text: "Hello, I'm your private AI Companion. I'm here to listen and support you. How are you feeling right now?"}]}]);
        }
    }, [isPremium]);

    if (!isPremium) {
        return <PremiumLock setCurrentView={setCurrentView} />;
    }

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading) return;
        
        const newHistory = [...messages, { role: 'user', parts: [{text: userInput}]}];
        setMessages(newHistory);
        setUserInput('');
        setIsLoading(true);

        const systemPrompt = "You are a calm, supportive, and empathetic AI companion. Your user is seeking a safe space to talk about their feelings, potentially related to PTSD or high stress. Your primary goals are: 1. Listen actively and validate their feelings without judgment. 2. If they express severe distress, gently guide them to use the app's 'Crisis Alert' feature or contact a professional resource from the 'Resources' tab. 3. Do NOT provide medical advice. 4. Keep responses concise and caring. Start your response now."
        const responseText = await generateGeminiContent(`${systemPrompt}\n\nMy current thought: ${userInput}`, newHistory);
        
        if (responseText) {
            setMessages(prev => [...prev, {role: 'model', parts: [{text: responseText}]}]);
        } else {
            addNotification({id: Date.now().toString(), type: 'error', message: "I'm having a little trouble connecting right now. Please try again in a moment."});
            setMessages(prev => prev.slice(0, -1)); // remove the user's message if AI fails
        }
        setIsLoading(false);
    };

    return (
        <div className="flex flex-col items-center justify-center h-full w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl mx-auto my-4">
            <h3 className="text-xl font-semibold mb-4 flex items-center"><Headphones className="mr-2 text-teal-300"/>Wellbeing Chat</h3>
            {circle.length === 0 ? ( <p className="text-gray-400">Add friends to your circle to request a chat.</p>
            ) : (
                <div className="space-y-4 w-full">
                    <select value={selectedFriend} onChange={e => setSelectedFriend(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="" disabled>Select a friend to call...</option>
                        {circle.map(friend => (<option key={friend.id} value={friend.id}>{friend.name}</option>))}
                    </select>
                    <button onClick={handleRequest} disabled={!selectedFriend} className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <Phone size={20}/>
                        <span>Request Chat</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function EnhancedStatusCheckSender({ circle, addNotification, sendSystemNotification }) {
    const [selectedFriend, setSelectedFriend] = useState('');
    const [messageTopic, setMessageTopic] = useState('');
    const [generatedMessage, setGeneratedMessage] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateMessage = async () => {
        if (!messageTopic.trim()) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please enter a topic for the message.' }); return; }
        setIsGenerating(true);
        setGeneratedMessage('');
        const prompt = `You are a caring friend. Based on the following theme, write one short, warm, and supportive check-in message (under 25 words) to send to a friend. Theme: '${messageTopic}'. Respond with only the message itself, without any extra text or quotation marks.`;
        const result = await generateGeminiContent(prompt);
        if (result) { setGeneratedMessage(result.trim()); } 
        else { addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not generate message. Try again.' }); }
        setIsGenerating(false);
    };

    const handleSend = async () => {
        if (!selectedFriend) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please select a friend.' }); return; }
        if (!generatedMessage.trim()) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please generate a message first.' }); return; }
        try {
            // START OF DEBUGGING ADDITION (Enhanced Status Check Send)
            console.log("DEBUG: Sending enhanced status check to:", selectedFriend, " message:", generatedMessage);
            // END OF DEBUGGING ADDITION
            await sendSystemNotification(selectedFriend, generatedMessage, 'check-in');
            addNotification({ id: Date.now().toString(), type: 'success', message: 'Status check sent!' });
            setSelectedFriend(''); setMessageTopic(''); setGeneratedMessage('');
        } catch (error) { console.error("Error sending status check:", error); addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not send status check.' }); }
    };
    
    return (
        <div className="flex flex-col items-center justify-center h-full w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl mx-auto my-4">
            <h3 className="text-xl font-semibold mb-4 flex items-center"><Sparkles className="mr-2 text-yellow-300"/>AI-Assisted Status Check</h3>
            {circle.length === 0 ? ( <p className="text-gray-400">Add friends to your circle to send them a status check.</p>
            ) : (
                <div className="space-y-4 w-full">
                    <select value={selectedFriend} onChange={e => setSelectedFriend(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="" disabled>1. Select a friend...</option>
                        {circle.map(friend => (<option key={friend.id} value={friend.id}>{friend.name}</option>))}
                    </select>
                    <div className="flex space-x-2 w-full">
                        <input type="text" value={messageTopic} onChange={e => setMessageTopic(e.target.value)} placeholder="2. Message topic (e.g., 'gentle check-in')" className="flex-grow bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                        <button onClick={handleGenerateMessage} disabled={isGenerating} className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center disabled:bg-yellow-800">
                             {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div> : <Sparkles size={20}/>}
                        </button>
                    </div>
                    {generatedMessage && ( <div className="bg-gray-700 p-3 rounded-lg w-full"> <p className="text-gray-300 italic">"{generatedMessage}"</p> </div> )}
                    <button onClick={handleSend} disabled={!generatedMessage || !selectedFriend} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <Send size={20}/>
                        <span>3. Send Message</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function CrisisModal({ alert, onRespond }) {
    const [guidance, setGuidance] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateGuidance = async () => {
        setIsGenerating(true);
        setGuidance('');
        const prompt = "A friend has sent a crisis alert indicating they are experiencing extreme distress, possibly a PTSD episode. As a mental health first aid expert, provide 3 brief, actionable tips for the person who is about to respond. The tips should be supportive, non-judgemental, and focus on immediate de-escalation and safety. Start with 'Remember:'.";
        const result = await generateGeminiContent(prompt);
        if (result) { setGuidance(result); } 
        else { setGuidance("Could not load tips. Focus on listening and showing you care."); }
        setIsGenerating(false);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-red-900 border-4 border-red-500 rounded-2xl p-8 max-w-lg w-full text-center shadow-2xl animate-pulse-intense">
                <AlertTriangle className="mx-auto text-red-300 h-24 w-24 mb-4" />
                <h2 className="text-4xl font-extrabold text-white mb-2">CRISIS ALERT</h2>
                <p className="text-2xl text-red-200 mb-6"> <span className="font-bold">{alert.fromUser.name}</span> needs help now. </p>
                <button onClick={() => onRespond(alert)} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-8 rounded-lg text-2xl transition-transform transform hover:scale-105"> I Can Help </button>
                <div className="mt-6">
                    <button onClick={handleGenerateGuidance} disabled={isGenerating} className="text-sm text-indigo-200 hover:text-white bg-indigo-800/50 hover:bg-indigo-700/50 font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 w-full">
                        {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <> <BrainCircuit size={16}/> <span>How to Help</span> </>}
                    </button>
                    {guidance && <div className="text-left text-sm mt-3 text-indigo-100 bg-black/20 p-3 rounded-md">{guidance}</div>}
                </div>
            </div>
        </div>
    );
}

function ActiveAlertCard({ alert, onCancel, addNotification }) {
    const [groundingExercise, setGroundingExercise] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateExercise = async () => {
        setIsGenerating(true); setGroundingExercise('');
        const prompt = "You are an expert in mindfulness. Generate a simple grounding exercise for someone in intense anxiety. It must be short, easy, and focus on the senses. Use simple numbered steps. Do not include a preamble.";
        const result = await generateGeminiContent(prompt);
        if (result) { setGroundingExercise(result); } 
        else { addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not generate exercise.' }); }
        setIsGenerating(false);
    };

    return (
        <div className="w-full p-6 bg-gray-800 rounded-2xl shadow-xl border-2 border-yellow-500 text-center space-y-4">
            <div>
                <div className="animate-pulse flex justify-center items-center text-yellow-400 mb-2"> <AlertTriangle size={24} className="mr-2"/> <p className="font-bold">ALERT SENT</p> </div>
                <p className="text-lg text-gray-300"> Your circle has been notified. </p>
                {alert.status === 'acknowledged' && ( <div className="bg-green-800/50 p-3 rounded-lg mt-4"> <p className="font-bold text-green-300">{alert.responder.name} is responding!</p> </div> )}
            </div>
            <div className="bg-gray-700/50 p-4 rounded-lg">
                <button onClick={handleGenerateExercise} disabled={isGenerating} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-indigo-900">
                    {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <> <BrainCircuit size={16}/> <span>Show a Calming Exercise</span> </>}
                    </button>
                {groundingExercise && ( <div className="text-left text-sm mt-4 text-indigo-100 bg-black/20 p-3 rounded-md">{groundingExercise}</div> )}
            </div>
            <button onClick={() => onCancel()} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors"> I'm OK Now (Cancel Alert) </button>
        </div>
    );
}

function DailyStatusSelector({ currentStatus, onStatusChange }) {
    const statuses = [
        { id: 'good', label: 'Feeling Good', icon: <Smile/>, color: 'border-green-500', selectedColor: 'bg-green-500 text-white' },
        { id: 'uneasy', label: 'Uneasy', icon: <Meh/>, color: 'border-yellow-500', selectedColor: 'bg-yellow-500 text-black' },
        { id: 'struggling', label: 'Struggling', icon: <Frown/>, color: 'border-red-500', selectedColor: 'bg-red-500 text-white' },
    ];
    return (
        <div className="w-full max-w-md p-4 bg-gray-800 rounded-2xl shadow-xl">
            <h3 className="text-lg font-semibold text-center mb-3 text-gray-300">How are you today?</h3>
            <div className="flex justify-around">
                {statuses.map(s => (
                    <button key={s.id} onClick={() => onStatusChange(s.id)} 
                    className={`flex items-center space-x-2 py-2 px-4 border-2 rounded-lg transition-colors ${currentStatus === s.id ? s.selectedColor : `bg-gray-700 hover:bg-gray-600 ${s.color}`}`}>
                        {s.icon} <span className="hidden sm:inline">{s.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}


function AICompanionView({ isPremium, setCurrentView, addNotification }) {
    const [messages, setMessages] = useState([]);
    const [userInput, setUserInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const chatEndRef = useRef(null);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    useEffect(scrollToBottom, [messages]);
    
    useEffect(() => {
        if(isPremium) {
            setMessages([{role: 'model', parts: [{text: "Hello, I'm your private AI Companion. I'm here to listen and support you. How are you feeling right now?"}]}]);
        }
    }, [isPremium]);

    if (!isPremium) {
        return <PremiumLock setCurrentView={setCurrentView} />;
    }

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading) return;
        
        const newHistory = [...messages, { role: 'user', parts: [{text: userInput}]}];
        setMessages(newHistory);
        setUserInput('');
        setIsLoading(true);

        const systemPrompt = "You are a calm, supportive, and empathetic AI companion. Your user is seeking a safe space to talk about their feelings, potentially related to PTSD or high stress. Your primary goals are: 1. Listen actively and validate their feelings without judgment. 2. If they express severe distress, gently guide them to use the app's 'Crisis Alert' feature or contact a professional resource from the 'Resources' tab. 3. Do NOT provide medical advice. 4. Keep responses concise and caring. Start your response now."
        const responseText = await generateGeminiContent(`${systemPrompt}\n\nMy current thought: ${userInput}`, newHistory);
        
        if (responseText) {
            setMessages(prev => [...prev, {role: 'model', parts: [{text: responseText}]}]);
        } else {
            addNotification({id: Date.now().toString(), type: 'error', message: "I'm having a little trouble connecting right now. Please try again in a moment."});
            setMessages(prev => prev.slice(0, -1)); // remove the user's message if AI fails
        }
        setIsLoading(false);
    };

    return (
        <div className="flex flex-col items-center justify-center h-full w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl mx-auto my-4">
            <h3 className="text-xl font-semibold mb-4 flex items-center"><Headphones className="mr-2 text-teal-300"/>Wellbeing Chat</h3>
            {circle.length === 0 ? ( <p className="text-gray-400">Add friends to your circle to request a chat.</p>
            ) : (
                <div className="space-y-4 w-full">
                    <select value={selectedFriend} onChange={e => setSelectedFriend(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="" disabled>Select a friend to call...</option>
                        {circle.map(friend => (<option key={friend.id} value={friend.id}>{friend.name}</option>))}
                    </select>
                    <button onClick={handleRequest} disabled={!selectedFriend} className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <Phone size={20}/>
                        <span>Request Chat</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function EnhancedStatusCheckSender({ circle, addNotification, sendSystemNotification }) {
    const [selectedFriend, setSelectedFriend] = useState('');
    const [messageTopic, setMessageTopic] = useState('');
    const [generatedMessage, setGeneratedMessage] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateMessage = async () => {
        if (!messageTopic.trim()) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please enter a topic for the message.' }); return; }
        setIsGenerating(true);
        setGeneratedMessage('');
        const prompt = `You are a caring friend. Based on the following theme, write one short, warm, and supportive check-in message (under 25 words) to send to a friend. Theme: '${messageTopic}'. Respond with only the message itself, without any extra text or quotation marks.`;
        const result = await generateGeminiContent(prompt);
        if (result) { setGeneratedMessage(result.trim()); } 
        else { addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not generate message. Try again.' }); }
        setIsGenerating(false);
    };

    const handleSend = async () => {
        if (!selectedFriend) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please select a friend.' }); return; }
        if (!generatedMessage.trim()) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please generate a message first.' }); return; }
        try {
            // START OF DEBUGGING ADDITION (Enhanced Status Check Send)
            console.log("DEBUG: Sending enhanced status check to:", selectedFriend, " message:", generatedMessage);
            // END OF DEBUGGING ADDITION
            await sendSystemNotification(selectedFriend, generatedMessage, 'check-in');
            addNotification({ id: Date.now().toString(), type: 'success', message: 'Status check sent!' });
            setSelectedFriend(''); setMessageTopic(''); setGeneratedMessage('');
        } catch (error) { console.error("Error sending status check:", error); addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not send status check.' }); }
    };
    
    return (
        <div className="flex flex-col items-center justify-center h-full w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl mx-auto my-4">
            <h3 className="text-xl font-semibold mb-4 flex items-center"><Sparkles className="mr-2 text-yellow-300"/>AI-Assisted Status Check</h3>
            {circle.length === 0 ? ( <p className="text-gray-400">Add friends to your circle to send them a status check.</p>
            ) : (
                <div className="space-y-4 w-full">
                    <select value={selectedFriend} onChange={e => setSelectedFriend(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="" disabled>Select a friend to call...</option>
                        {circle.map(friend => (<option key={friend.id} value={friend.id}>{friend.name}</option>))}
                    </select>
                    <div className="flex space-x-2 w-full">
                        <input type="text" value={messageTopic} onChange={e => setMessageTopic(e.target.value)} placeholder="2. Message topic (e.g., 'gentle check-in')" className="flex-grow bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                        <button onClick={handleGenerateMessage} disabled={isGenerating} className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center disabled:bg-yellow-800">
                             {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div> : <Sparkles size={20}/>}
                        </button>
                    </div>
                    {generatedMessage && ( <div className="bg-gray-700 p-3 rounded-lg w-full"> <p className="text-gray-300 italic">"{generatedMessage}"</p> </div> )}
                    <button onClick={handleSend} disabled={!generatedMessage || !selectedFriend} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <Send size={20}/>
                        <span>3. Send Message</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function CrisisModal({ alert, onRespond }) {
    const [guidance, setGuidance] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateGuidance = async () => {
        setIsGenerating(true);
        setGuidance('');
        const prompt = "A friend has sent a crisis alert indicating they are experiencing extreme distress, possibly a PTSD episode. As a mental health first aid expert, provide 3 brief, actionable tips for the person who is about to respond. The tips should be supportive, non-judgemental, and focus on immediate de-escalation and safety. Start with 'Remember:'.";
        const result = await generateGeminiContent(prompt);
        if (result) { setGuidance(result); } 
        else { setGuidance("Could not load tips. Focus on listening and showing you care."); }
        setIsGenerating(false);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-red-900 border-4 border-red-500 rounded-2xl p-8 max-w-lg w-full text-center shadow-2xl animate-pulse-intense">
                <AlertTriangle className="mx-auto text-red-300 h-24 w-24 mb-4" />
                <h2 className="text-4xl font-extrabold text-white mb-2">CRISIS ALERT</h2>
                <p className="text-2xl text-red-200 mb-6"> <span className="font-bold">{alert.fromUser.name}</span> needs help now. </p>
                <button onClick={() => onRespond(alert)} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-8 rounded-lg text-2xl transition-transform transform hover:scale-105"> I Can Help </button>
                <div className="mt-6">
                    <button onClick={handleGenerateGuidance} disabled={isGenerating} className="text-sm text-indigo-200 hover:text-white bg-indigo-800/50 hover:bg-indigo-700/50 font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 w-full">
                        {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <> <BrainCircuit size={16}/> <span>How to Help</span> </>}
                    </button>
                    {guidance && <div className="text-left text-sm mt-3 text-indigo-100 bg-black/20 p-3 rounded-md">{guidance}</div>}
                </div>
            </div>
        </div>
    );
}

function ActiveAlertCard({ alert, onCancel, addNotification }) {
    const [groundingExercise, setGroundingExercise] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateExercise = async () => {
        setIsGenerating(true); setGroundingExercise('');
        const prompt = "You are an expert in mindfulness. Generate a simple grounding exercise for someone in intense anxiety. It must be short, easy, and focus on the senses. Use simple numbered steps. Do not include a preamble.";
        const result = await generateGeminiContent(prompt);
        if (result) { setGroundingExercise(result); } 
        else { addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not generate exercise.' }); }
        setIsGenerating(false);
    };

    return (
        <div className="w-full p-6 bg-gray-800 rounded-2xl shadow-xl border-2 border-yellow-500 text-center space-y-4">
            <div>
                <div className="animate-pulse flex justify-center items-center text-yellow-400 mb-2"> <AlertTriangle size={24} className="mr-2"/> <p className="font-bold">ALERT SENT</p> </div>
                <p className="text-lg text-gray-300"> Your circle has been notified. </p>
                {alert.status === 'acknowledged' && ( <div className="bg-green-800/50 p-3 rounded-lg mt-4"> <p className="font-bold text-green-300">{alert.responder.name} is responding!</p> </div> )}
            </div>
            <div className="bg-gray-700/50 p-4 rounded-lg">
                <button onClick={handleGenerateExercise} disabled={isGenerating} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-indigo-900">
                    {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <> <BrainCircuit size={16}/> <span>Show a Calming Exercise</span> </>}
                    </button>
                {groundingExercise && ( <div className="text-left text-sm mt-4 text-indigo-100 bg-black/20 p-3 rounded-md">{groundingExercise}</div> )}
            </div>
            <button onClick={() => onCancel()} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors"> I'm OK Now (Cancel Alert) </button>
        </div>
    );
}

function DailyStatusSelector({ currentStatus, onStatusChange }) {
    const statuses = [
        { id: 'good', label: 'Feeling Good', icon: <Smile/>, color: 'border-green-500', selectedColor: 'bg-green-500 text-white' },
        { id: 'uneasy', label: 'Uneasy', icon: <Meh/>, color: 'border-yellow-500', selectedColor: 'bg-yellow-500 text-black' },
        { id: 'struggling', label: 'Struggling', icon: <Frown/>, color: 'border-red-500', selectedColor: 'bg-red-500 text-white' },
    ];
    return (
        <div className="w-full max-w-md p-4 bg-gray-800 rounded-2xl shadow-xl">
            <h3 className="text-lg font-semibold text-center mb-3 text-gray-300">How are you today?</h3>
            <div className="flex justify-around">
                {statuses.map(s => (
                    <button key={s.id} onClick={() => onStatusChange(s.id)} 
                    className={`flex items-center space-x-2 py-2 px-4 border-2 rounded-lg transition-colors ${currentStatus === s.id ? s.selectedColor : `bg-gray-700 hover:bg-gray-600 ${s.color}`}`}>
                        {s.icon} <span className="hidden sm:inline">{s.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}


function AICompanionView({ isPremium, setCurrentView, addNotification }) {
    const [messages, setMessages] = useState([]);
    const [userInput, setUserInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const chatEndRef = useRef(null);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    useEffect(scrollToBottom, [messages]);
    
    useEffect(() => {
        if(isPremium) {
            setMessages([{role: 'model', parts: [{text: "Hello, I'm your private AI Companion. I'm here to listen and support you. How are you feeling right now?"}]}]);
        }
    }, [isPremium]);

    if (!isPremium) {
        return <PremiumLock setCurrentView={setCurrentView} />;
    }

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading) return;
        
        const newHistory = [...messages, { role: 'user', parts: [{text: userInput}]}];
        setMessages(newHistory);
        setUserInput('');
        setIsLoading(true);

        const systemPrompt = "You are a calm, supportive, and empathetic AI companion. Your user is seeking a safe space to talk about their feelings, potentially related to PTSD or high stress. Your primary goals are: 1. Listen actively and validate their feelings without judgment. 2. If they express severe distress, gently guide them to use the app's 'Crisis Alert' feature or contact a professional resource from the 'Resources' tab. 3. Do NOT provide medical advice. 4. Keep responses concise and caring. Start your response now."
        const responseText = await generateGeminiContent(`${systemPrompt}\n\nMy current thought: ${userInput}`, newHistory);
        
        if (responseText) {
            setMessages(prev => [...prev, {role: 'model', parts: [{text: responseText}]}]);
        } else {
            addNotification({id: Date.now().toString(), type: 'error', message: "I'm having a little trouble connecting right now. Please try again in a moment."});
            setMessages(prev => prev.slice(0, -1)); // remove the user's message if AI fails
        }
        setIsLoading(false);
    };

    return (
        <div className="flex flex-col items-center justify-center h-full w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl mx-auto my-4">
            <h3 className="text-xl font-semibold mb-4 flex items-center"><Headphones className="mr-2 text-teal-300"/>Wellbeing Chat</h3>
            {circle.length === 0 ? ( <p className="text-gray-400">Add friends to your circle to request a chat.</p>
            ) : (
                <div className="space-y-4 w-full">
                    <select value={selectedFriend} onChange={e => setSelectedFriend(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="" disabled>Select a friend to call...</option>
                        {circle.map(friend => (<option key={friend.id} value={friend.id}>{friend.name}</option>))}
                    </select>
                    <button onClick={handleRequest} disabled={!selectedFriend} className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <Phone size={20}/>
                        <span>Request Chat</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function EnhancedStatusCheckSender({ circle, addNotification, sendSystemNotification }) {
    const [selectedFriend, setSelectedFriend] = useState('');
    const [messageTopic, setMessageTopic] = useState('');
    const [generatedMessage, setGeneratedMessage] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateMessage = async () => {
        if (!messageTopic.trim()) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please enter a topic for the message.' }); return; }
        setIsGenerating(true);
        setGeneratedMessage('');
        const prompt = `You are a caring friend. Based on the following theme, write one short, warm, and supportive check-in message (under 25 words) to send to a friend. Theme: '${messageTopic}'. Respond with only the message itself, without any extra text or quotation marks.`;
        const result = await generateGeminiContent(prompt);
        if (result) { setGeneratedMessage(result.trim()); } 
        else { addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not generate message. Try again.' }); }
        setIsGenerating(false);
    };

    const handleSend = async () => {
        if (!selectedFriend) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please select a friend.' }); return; }
        if (!generatedMessage.trim()) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please generate a message first.' }); return; }
        try {
            // START OF DEBUGGING ADDITION (Enhanced Status Check Send)
            console.log("DEBUG: Sending enhanced status check to:", selectedFriend, " message:", generatedMessage);
            // END OF DEBUGGING ADDITION
            await sendSystemNotification(selectedFriend, generatedMessage, 'check-in');
            addNotification({ id: Date.now().toString(), type: 'success', message: 'Status check sent!' });
            setSelectedFriend(''); setMessageTopic(''); setGeneratedMessage('');
        } catch (error) { console.error("Error sending status check:", error); addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not send status check.' }); }
    };
    
    return (
        <div className="flex flex-col items-center justify-center h-full w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl mx-auto my-4">
            <h3 className="text-xl font-semibold mb-4 flex items-center"><Sparkles className="mr-2 text-yellow-300"/>AI-Assisted Status Check</h3>
            {circle.length === 0 ? ( <p className="text-gray-400">Add friends to your circle to send them a status check.</p>
            ) : (
                <div className="space-y-4 w-full">
                    <select value={selectedFriend} onChange={e => setSelectedFriend(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="" disabled>1. Select a friend...</option>
                        {circle.map(friend => (<option key={friend.id} value={friend.id}>{friend.name}</option>))}
                    </select>
                    <div className="flex space-x-2 w-full">
                        <input type="text" value={messageTopic} onChange={e => setMessageTopic(e.target.value)} placeholder="2. Message topic (e.g., 'gentle check-in')" className="flex-grow bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                        <button onClick={handleGenerateMessage} disabled={isGenerating} className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center disabled:bg-yellow-800">
                             {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div> : <Sparkles size={20}/>}
                        </button>
                    </div>
                    {generatedMessage && ( <div className="bg-gray-700 p-3 rounded-lg w-full"> <p className="text-gray-300 italic">"{generatedMessage}"</p> </div> )}
                    <button onClick={handleSend} disabled={!generatedMessage || !selectedFriend} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <Send size={20}/>
                        <span>3. Send Message</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function CrisisModal({ alert, onRespond }) {
    const [guidance, setGuidance] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateGuidance = async () => {
        setIsGenerating(true);
        setGuidance('');
        const prompt = "A friend has sent a crisis alert indicating they are experiencing extreme distress, possibly a PTSD episode. As a mental health first aid expert, provide 3 brief, actionable tips for the person who is about to respond. The tips should be supportive, non-judgemental, and focus on immediate de-escalation and safety. Start with 'Remember:'.";
        const result = await generateGeminiContent(prompt);
        if (result) { setGuidance(result); } 
        else { setGuidance("Could not load tips. Focus on listening and showing you care."); }
        setIsGenerating(false);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-red-900 border-4 border-red-500 rounded-2xl p-8 max-w-lg w-full text-center shadow-2xl animate-pulse-intense">
                <AlertTriangle className="mx-auto text-red-300 h-24 w-24 mb-4" />
                <h2 className="text-4xl font-extrabold text-white mb-2">CRISIS ALERT</h2>
                <p className="text-2xl text-red-200 mb-6"> <span className="font-bold">{alert.fromUser.name}</span> needs help now. </p>
                <button onClick={() => onRespond(alert)} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-8 rounded-lg text-2xl transition-transform transform hover:scale-105"> I Can Help </button>
                <div className="mt-6">
                    <button onClick={handleGenerateGuidance} disabled={isGenerating} className="text-sm text-indigo-200 hover:text-white bg-indigo-800/50 hover:bg-indigo-700/50 font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 w-full">
                        {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <> <BrainCircuit size={16}/> <span>How to Help</span> </>}
                    </button>
                    {guidance && <div className="text-left text-sm mt-3 text-indigo-100 bg-black/20 p-3 rounded-md">{guidance}</div>}
                </div>
            </div>
        </div>
    );
}

function ActiveAlertCard({ alert, onCancel, addNotification }) {
    const [groundingExercise, setGroundingExercise] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateExercise = async () => {
        setIsGenerating(true); setGroundingExercise('');
        const prompt = "You are an expert in mindfulness. Generate a simple grounding exercise for someone in intense anxiety. It must be short, easy, and focus on the senses. Use simple numbered steps. Do not include a preamble.";
        const result = await generateGeminiContent(prompt);
        if (result) { setGroundingExercise(result); } 
        else { addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not generate exercise.' }); }
        setIsGenerating(false);
    };

    return (
        <div className="w-full p-6 bg-gray-800 rounded-2xl shadow-xl border-2 border-yellow-500 text-center space-y-4">
            <div>
                <div className="animate-pulse flex justify-center items-center text-yellow-400 mb-2"> <AlertTriangle size={24} className="mr-2"/> <p className="font-bold">ALERT SENT</p> </div>
                <p className="text-lg text-gray-300"> Your circle has been notified. </p>
                {alert.status === 'acknowledged' && ( <div className="bg-green-800/50 p-3 rounded-lg mt-4"> <p className="font-bold text-green-300">{alert.responder.name} is responding!</p> </div> )}
            </div>
            <div className="bg-gray-700/50 p-4 rounded-lg">
                <button onClick={handleGenerateExercise} disabled={isGenerating} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-indigo-900">
                    {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <> <BrainCircuit size={16}/> <span>Show a Calming Exercise</span> </>}
                    </button>
                {groundingExercise && ( <div className="text-left text-sm mt-4 text-indigo-100 bg-black/20 p-3 rounded-md">{groundingExercise}</div> )}
            </div>
            <button onClick={() => onCancel()} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors"> I'm OK Now (Cancel Alert) </button>
        </div>
    );
}

function DailyStatusSelector({ currentStatus, onStatusChange }) {
    const statuses = [
        { id: 'good', label: 'Feeling Good', icon: <Smile/>, color: 'border-green-500', selectedColor: 'bg-green-500 text-white' },
        { id: 'uneasy', label: 'Uneasy', icon: <Meh/>, color: 'border-yellow-500', selectedColor: 'bg-yellow-500 text-black' },
        { id: 'struggling', label: 'Struggling', icon: <Frown/>, color: 'border-red-500', selectedColor: 'bg-red-500 text-white' },
    ];
    return (
        <div className="w-full max-w-md p-4 bg-gray-800 rounded-2xl shadow-xl">
            <h3 className="text-lg font-semibold text-center mb-3 text-gray-300">How are you today?</h3>
            <div className="flex justify-around">
                {statuses.map(s => (
                    <button key={s.id} onClick={() => onStatusChange(s.id)} 
                    className={`flex items-center space-x-2 py-2 px-4 border-2 rounded-lg transition-colors ${currentStatus === s.id ? s.selectedColor : `bg-gray-700 hover:bg-gray-600 ${s.color}`}`}>
                        {s.icon} <span className="hidden sm:inline">{s.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}


function AICompanionView({ isPremium, setCurrentView, addNotification }) {
    const [messages, setMessages] = useState([]);
    const [userInput, setUserInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const chatEndRef = useRef(null);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    useEffect(scrollToBottom, [messages]);
    
    useEffect(() => {
        if(isPremium) {
            setMessages([{role: 'model', parts: [{text: "Hello, I'm your private AI Companion. I'm here to listen and support you. How are you feeling right now?"}]}]);
        }
    }, [isPremium]);

    if (!isPremium) {
        return <PremiumLock setCurrentView={setCurrentView} />;
    }

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading) return;
        
        const newHistory = [...messages, { role: 'user', parts: [{text: userInput}]}];
        setMessages(newHistory);
        setUserInput('');
        setIsLoading(true);

        const systemPrompt = "You are a calm, supportive, and empathetic AI companion. Your user is seeking a safe space to talk about their feelings, potentially related to PTSD or high stress. Your primary goals are: 1. Listen actively and validate their feelings without judgment. 2. If they express severe distress, gently guide them to use the app's 'Crisis Alert' feature or contact a professional resource from the 'Resources' tab. 3. Do NOT provide medical advice. 4. Keep responses concise and caring. Start your response now."
        const responseText = await generateGeminiContent(`${systemPrompt}\n\nMy current thought: ${userInput}`, newHistory);
        
        if (responseText) {
            setMessages(prev => [...prev, {role: 'model', parts: [{text: responseText}]}]);
        } else {
            addNotification({id: Date.now().toString(), type: 'error', message: "I'm having a little trouble connecting right now. Please try again in a moment."});
            setMessages(prev => prev.slice(0, -1)); // remove the user's message if AI fails
        }
        setIsLoading(false);
    };

    return (
        <div className="flex flex-col items-center justify-center h-full w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl mx-auto my-4">
            <h3 className="text-xl font-semibold mb-4 flex items-center"><Headphones className="mr-2 text-teal-300"/>Wellbeing Chat</h3>
            {circle.length === 0 ? ( <p className="text-gray-400">Add friends to your circle to request a chat.</p>
            ) : (
                <div className="space-y-4 w-full">
                    <select value={selectedFriend} onChange={e => setSelectedFriend(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="" disabled>Select a friend to call...</option>
                        {circle.map(friend => (<option key={friend.id} value={friend.id}>{friend.name}</option>))}
                    </select>
                    <button onClick={handleRequest} disabled={!selectedFriend} className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <Phone size={20}/>
                        <span>Request Chat</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function EnhancedStatusCheckSender({ circle, addNotification, sendSystemNotification }) {
    const [selectedFriend, setSelectedFriend] = useState('');
    const [messageTopic, setMessageTopic] = useState('');
    const [generatedMessage, setGeneratedMessage] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateMessage = async () => {
        if (!messageTopic.trim()) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please enter a topic for the message.' }); return; }
        setIsGenerating(true);
        setGeneratedMessage('');
        const prompt = `You are a caring friend. Based on the following theme, write one short, warm, and supportive check-in message (under 25 words) to send to a friend. Theme: '${messageTopic}'. Respond with only the message itself, without any extra text or quotation marks.`;
        const result = await generateGeminiContent(prompt);
        if (result) { setGeneratedMessage(result.trim()); } 
        else { addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not generate message. Try again.' }); }
        setIsGenerating(false);
    };

    const handleSend = async () => {
        if (!selectedFriend) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please select a friend.' }); return; }
        if (!generatedMessage.trim()) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please generate a message first.' }); return; }
        try {
            // START OF DEBUGGING ADDITION (Enhanced Status Check Send)
            console.log("DEBUG: Sending enhanced status check to:", selectedFriend, " message:", generatedMessage);
            // END OF DEBUGGING ADDITION
            await sendSystemNotification(selectedFriend, generatedMessage, 'check-in');
            addNotification({ id: Date.now().toString(), type: 'success', message: 'Status check sent!' });
            setSelectedFriend(''); setMessageTopic(''); setGeneratedMessage('');
        } catch (error) { console.error("Error sending status check:", error); addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not send status check.' }); }
    };
    
    return (
        <div className="flex flex-col items-center justify-center h-full w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl mx-auto my-4">
            <h3 className="text-xl font-semibold mb-4 flex items-center"><Sparkles className="mr-2 text-yellow-300"/>AI-Assisted Status Check</h3>
            {circle.length === 0 ? ( <p className="text-gray-400">Add friends to your circle to send them a status check.</p>
            ) : (
                <div className="space-y-4 w-full">
                    <select value={selectedFriend} onChange={e => setSelectedFriend(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="" disabled>1. Select a friend...</option>
                        {circle.map(friend => (<option key={friend.id} value={friend.id}>{friend.name}</option>))}
                    </select>
                    <div className="flex space-x-2 w-full">
                        <input type="text" value={messageTopic} onChange={e => setMessageTopic(e.target.value)} placeholder="2. Message topic (e.g., 'gentle check-in')" className="flex-grow bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                        <button onClick={handleGenerateMessage} disabled={isGenerating} className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center disabled:bg-yellow-800">
                             {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div> : <Sparkles size={20}/>}
                        </button>
                    </div>
                    {generatedMessage && ( <div className="bg-gray-700 p-3 rounded-lg w-full"> <p className="text-gray-300 italic">"{generatedMessage}"</p> </div> )}
                    <button onClick={handleSend} disabled={!generatedMessage || !selectedFriend} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <Send size={20}/>
                        <span>3. Send Message</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function CrisisModal({ alert, onRespond }) {
    const [guidance, setGuidance] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateGuidance = async () => {
        setIsGenerating(true);
        setGuidance('');
        const prompt = "A friend has sent a crisis alert indicating they are experiencing extreme distress, possibly a PTSD episode. As a mental health first aid expert, provide 3 brief, actionable tips for the person who is about to respond. The tips should be supportive, non-judgemental, and focus on immediate de-escalation and safety. Start with 'Remember:'.";
        const result = await generateGeminiContent(prompt);
        if (result) { setGuidance(result); } 
        else { setGuidance("Could not load tips. Focus on listening and showing you care."); }
        setIsGenerating(false);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-red-900 border-4 border-red-500 rounded-2xl p-8 max-w-lg w-full text-center shadow-2xl animate-pulse-intense">
                <AlertTriangle className="mx-auto text-red-300 h-24 w-24 mb-4" />
                <h2 className="text-4xl font-extrabold text-white mb-2">CRISIS ALERT</h2>
                <p className="text-2xl text-red-200 mb-6"> <span className="font-bold">{alert.fromUser.name}</span> needs help now. </p>
                <button onClick={() => onRespond(alert)} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-8 rounded-lg text-2xl transition-transform transform hover:scale-105"> I Can Help </button>
                <div className="mt-6">
                    <button onClick={handleGenerateGuidance} disabled={isGenerating} className="text-sm text-indigo-200 hover:text-white bg-indigo-800/50 hover:bg-indigo-700/50 font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 w-full">
                        {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <> <BrainCircuit size={16}/> <span>How to Help</span> </>}
                    </button>
                    {guidance && <div className="text-left text-sm mt-3 text-indigo-100 bg-black/20 p-3 rounded-md">{guidance}</div>}
                </div>
            </div>
        </div>
    );
}

function ActiveAlertCard({ alert, onCancel, addNotification }) {
    const [groundingExercise, setGroundingExercise] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateExercise = async () => {
        setIsGenerating(true); setGroundingExercise('');
        const prompt = "You are an expert in mindfulness. Generate a simple grounding exercise for someone in intense anxiety. It must be short, easy, and focus on the senses. Use simple numbered steps. Do not include a preamble.";
        const result = await generateGeminiContent(prompt);
        if (result) { setGroundingExercise(result); } 
        else { addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not generate exercise.' }); }
        setIsGenerating(false);
    };

    return (
        <div className="w-full p-6 bg-gray-800 rounded-2xl shadow-xl border-2 border-yellow-500 text-center space-y-4">
            <div>
                <div className="animate-pulse flex justify-center items-center text-yellow-400 mb-2"> <AlertTriangle size={24} className="mr-2"/> <p className="font-bold">ALERT SENT</p> </div>
                <p className="text-lg text-gray-300"> Your circle has been notified. </p>
                {alert.status === 'acknowledged' && ( <div className="bg-green-800/50 p-3 rounded-lg mt-4"> <p className="font-bold text-green-300">{alert.responder.name} is responding!</p> </div> )}
            </div>
            <div className="bg-gray-700/50 p-4 rounded-lg">
                <button onClick={handleGenerateExercise} disabled={isGenerating} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-indigo-900">
                    {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <> <BrainCircuit size={16}/> <span>Show a Calming Exercise</span> </>}
                    </button>
                {groundingExercise && ( <div className="text-left text-sm mt-4 text-indigo-100 bg-black/20 p-3 rounded-md">{groundingExercise}</div> )}
            </div>
            <button onClick={() => onCancel()} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors"> I'm OK Now (Cancel Alert) </button>
        </div>
    );
}

function DailyStatusSelector({ currentStatus, onStatusChange }) {
    const statuses = [
        { id: 'good', label: 'Feeling Good', icon: <Smile/>, color: 'border-green-500', selectedColor: 'bg-green-500 text-white' },
        { id: 'uneasy', label: 'Uneasy', icon: <Meh/>, color: 'border-yellow-500', selectedColor: 'bg-yellow-500 text-black' },
        { id: 'struggling', label: 'Struggling', icon: <Frown/>, color: 'border-red-500', selectedColor: 'bg-red-500 text-white' },
    ];
    return (
        <div className="w-full max-w-md p-4 bg-gray-800 rounded-2xl shadow-xl">
            <h3 className="text-lg font-semibold text-center mb-3 text-gray-300">How are you today?</h3>
            <div className="flex justify-around">
                {statuses.map(s => (
                    <button key={s.id} onClick={() => onStatusChange(s.id)} 
                    className={`flex items-center space-x-2 py-2 px-4 border-2 rounded-lg transition-colors ${currentStatus === s.id ? s.selectedColor : `bg-gray-700 hover:bg-gray-600 ${s.color}`}`}>
                        {s.icon} <span className="hidden sm:inline">{s.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}


function AICompanionView({ isPremium, setCurrentView, addNotification }) {
    const [messages, setMessages] = useState([]);
    const [userInput, setUserInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const chatEndRef = useRef(null);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    useEffect(scrollToBottom, [messages]);
    
    useEffect(() => {
        if(isPremium) {
            setMessages([{role: 'model', parts: [{text: "Hello, I'm your private AI Companion. I'm here to listen and support you. How are you feeling right now?"}]}]);
        }
    }, [isPremium]);

    if (!isPremium) {
        return <PremiumLock setCurrentView={setCurrentView} />;
    }

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading) return;
        
        const newHistory = [...messages, { role: 'user', parts: [{text: userInput}]}];
        setMessages(newHistory);
        setUserInput('');
        setIsLoading(true);

        const systemPrompt = "You are a calm, supportive, and empathetic AI companion. Your user is seeking a safe space to talk about their feelings, potentially related to PTSD or high stress. Your primary goals are: 1. Listen actively and validate their feelings without judgment. 2. If they express severe distress, gently guide them to use the app's 'Crisis Alert' feature or contact a professional resource from the 'Resources' tab. 3. Do NOT provide medical advice. 4. Keep responses concise and caring. Start your response now."
        const responseText = await generateGeminiContent(`${systemPrompt}\n\nMy current thought: ${userInput}`, newHistory);
        
        if (responseText) {
            setMessages(prev => [...prev, {role: 'model', parts: [{text: responseText}]}]);
        } else {
            addNotification({id: Date.now().toString(), type: 'error', message: "I'm having a little trouble connecting right now. Please try again in a moment."});
            setMessages(prev => prev.slice(0, -1)); // remove the user's message if AI fails
        }
        setIsLoading(false);
    };

    return (
        <div className="flex flex-col items-center justify-center h-full w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl mx-auto my-4">
            <h3 className="text-xl font-semibold mb-4 flex items-center"><Headphones className="mr-2 text-teal-300"/>Wellbeing Chat</h3>
            {circle.length === 0 ? ( <p className="text-gray-400">Add friends to your circle to request a chat.</p>
            ) : (
                <div className="space-y-4 w-full">
                    <select value={selectedFriend} onChange={e => setSelectedFriend(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="" disabled>Select a friend to call...</option>
                        {circle.map(friend => (<option key={friend.id} value={friend.id}>{friend.name}</option>))}
                    </select>
                    <button onClick={handleRequest} disabled={!selectedFriend} className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <Phone size={20}/>
                        <span>Request Chat</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function EnhancedStatusCheckSender({ circle, addNotification, sendSystemNotification }) {
    const [selectedFriend, setSelectedFriend] = useState('');
    const [messageTopic, setMessageTopic] = useState('');
    const [generatedMessage, setGeneratedMessage] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateMessage = async () => {
        if (!messageTopic.trim()) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please enter a topic for the message.' }); return; }
        setIsGenerating(true);
        setGeneratedMessage('');
        const prompt = `You are a caring friend. Based on the following theme, write one short, warm, and supportive check-in message (under 25 words) to send to a friend. Theme: '${messageTopic}'. Respond with only the message itself, without any extra text or quotation marks.`;
        const result = await generateGeminiContent(prompt);
        if (result) { setGeneratedMessage(result.trim()); } 
        else { addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not generate message. Try again.' }); }
        setIsGenerating(false);
    };

    const handleSend = async () => {
        if (!selectedFriend) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please select a friend.' }); return; }
        if (!generatedMessage.trim()) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please generate a message first.' }); return; }
        try {
            // START OF DEBUGGING ADDITION (Enhanced Status Check Send)
            console.log("DEBUG: Sending enhanced status check to:", selectedFriend, " message:", generatedMessage);
            // END OF DEBUGGING ADDITION
            await sendSystemNotification(selectedFriend, generatedMessage, 'check-in');
            addNotification({ id: Date.now().toString(), type: 'success', message: 'Status check sent!' });
            setSelectedFriend(''); setMessageTopic(''); setGeneratedMessage('');
        } catch (error) { console.error("Error sending status check:", error); addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not send status check.' }); }
    };
    
    return (
        <div className="flex flex-col items-center justify-center h-full w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl mx-auto my-4">
            <h3 className="text-xl font-semibold mb-4 flex items-center"><Sparkles className="mr-2 text-yellow-300"/>AI-Assisted Status Check</h3>
            {circle.length === 0 ? ( <p className="text-gray-400">Add friends to your circle to send them a status check.</p>
            ) : (
                <div className="space-y-4 w-full">
                    <select value={selectedFriend} onChange={e => setSelectedFriend(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="" disabled>Select a friend to call...</option>
                        {circle.map(friend => (<option key={friend.id} value={friend.id}>{friend.name}</option>))}
                    </select>
                    <div className="flex space-x-2 w-full">
                        <input type="text" value={messageTopic} onChange={e => setMessageTopic(e.target.value)} placeholder="2. Message topic (e.g., 'gentle check-in')" className="flex-grow bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                        <button onClick={handleGenerateMessage} disabled={isGenerating} className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center disabled:bg-yellow-800">
                             {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div> : <Sparkles size={20}/>}
                        </button>
                    </div>
                    {generatedMessage && ( <div className="bg-gray-700 p-3 rounded-lg w-full"> <p className="text-gray-300 italic">"{generatedMessage}"</p> </div> )}
                    <button onClick={handleSend} disabled={!generatedMessage || !selectedFriend} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <Send size={20}/>
                        <span>3. Send Message</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function CrisisModal({ alert, onRespond }) {
    const [guidance, setGuidance] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateGuidance = async () => {
        setIsGenerating(true);
        setGuidance('');
        const prompt = "A friend has sent a crisis alert indicating they are experiencing extreme distress, possibly a PTSD episode. As a mental health first aid expert, provide 3 brief, actionable tips for the person who is about to respond. The tips should be supportive, non-judgemental, and focus on immediate de-escalation and safety. Start with 'Remember:'.";
        const result = await generateGeminiContent(prompt);
        if (result) { setGuidance(result); } 
        else { setGuidance("Could not load tips. Focus on listening and showing you care."); }
        setIsGenerating(false);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-red-900 border-4 border-red-500 rounded-2xl p-8 max-w-lg w-full text-center shadow-2xl animate-pulse-intense">
                <AlertTriangle className="mx-auto text-red-300 h-24 w-24 mb-4" />
                <h2 className="text-4xl font-extrabold text-white mb-2">CRISIS ALERT</h2>
                <p className="text-2xl text-red-200 mb-6"> <span className="font-bold">{alert.fromUser.name}</span> needs help now. </p>
                <button onClick={() => onRespond(alert)} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-8 rounded-lg text-2xl transition-transform transform hover:scale-105"> I Can Help </button>
                <div className="mt-6">
                    <button onClick={handleGenerateGuidance} disabled={isGenerating} className="text-sm text-indigo-200 hover:text-white bg-indigo-800/50 hover:bg-indigo-700/50 font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 w-full">
                        {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <> <BrainCircuit size={16}/> <span>How to Help</span> </>}
                    </button>
                    {guidance && <div className="text-left text-sm mt-3 text-indigo-100 bg-black/20 p-3 rounded-md">{guidance}</div>}
                </div>
            </div>
        </div>
    );
}

function ActiveAlertCard({ alert, onCancel, addNotification }) {
    const [groundingExercise, setGroundingExercise] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateExercise = async () => {
        setIsGenerating(true); setGroundingExercise('');
        const prompt = "You are an expert in mindfulness. Generate a simple grounding exercise for someone in intense anxiety. It must be short, easy, and focus on the senses. Use simple numbered steps. Do not include a preamble.";
        const result = await generateGeminiContent(prompt);
        if (result) { setGroundingExercise(result); } 
        else { addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not generate exercise.' }); }
        setIsGenerating(false);
    };

    return (
        <div className="w-full p-6 bg-gray-800 rounded-2xl shadow-xl border-2 border-yellow-500 text-center space-y-4">
            <div>
                <div className="animate-pulse flex justify-center items-center text-yellow-400 mb-2"> <AlertTriangle size={24} className="mr-2"/> <p className="font-bold">ALERT SENT</p> </div>
                <p className="text-lg text-gray-300"> Your circle has been notified. </p>
                {alert.status === 'acknowledged' && ( <div className="bg-green-800/50 p-3 rounded-lg mt-4"> <p className="font-bold text-green-300">{alert.responder.name} is responding!</p> </div> )}
            </div>
            <div className="bg-gray-700/50 p-4 rounded-lg">
                <button onClick={handleGenerateExercise} disabled={isGenerating} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-indigo-900">
                    {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <> <BrainCircuit size={16}/> <span>Show a Calming Exercise</span> </>}
                    </button>
                {groundingExercise && ( <div className="text-left text-sm mt-4 text-indigo-100 bg-black/20 p-3 rounded-md">{groundingExercise}</div> )}
            </div>
            <button onClick={() => onCancel()} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors"> I'm OK Now (Cancel Alert) </button>
        </div>
    );
}

function DailyStatusSelector({ currentStatus, onStatusChange }) {
    const statuses = [
        { id: 'good', label: 'Feeling Good', icon: <Smile/>, color: 'border-green-500', selectedColor: 'bg-green-500 text-white' },
        { id: 'uneasy', label: 'Uneasy', icon: <Meh/>, color: 'border-yellow-500', selectedColor: 'bg-yellow-500 text-black' },
        { id: 'struggling', label: 'Struggling', icon: <Frown/>, color: 'border-red-500', selectedColor: 'bg-red-500 text-white' },
    ];
    return (
        <div className="w-full max-w-md p-4 bg-gray-800 rounded-2xl shadow-xl">
            <h3 className="text-lg font-semibold text-center mb-3 text-gray-300">How are you today?</h3>
            <div className="flex justify-around">
                {statuses.map(s => (
                    <button key={s.id} onClick={() => onStatusChange(s.id)} 
                    className={`flex items-center space-x-2 py-2 px-4 border-2 rounded-lg transition-colors ${currentStatus === s.id ? s.selectedColor : `bg-gray-700 hover:bg-gray-600 ${s.color}`}`}>
                        {s.icon} <span className="hidden sm:inline">{s.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}


function AICompanionView({ isPremium, setCurrentView, addNotification }) {
    const [messages, setMessages] = useState([]);
    const [userInput, setUserInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const chatEndRef = useRef(null);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    useEffect(scrollToBottom, [messages]);
    
    useEffect(() => {
        if(isPremium) {
            setMessages([{role: 'model', parts: [{text: "Hello, I'm your private AI Companion. I'm here to listen and support you. How are you feeling right now?"}]}]);
        }
    }, [isPremium]);

    if (!isPremium) {
        return <PremiumLock setCurrentView={setCurrentView} />;
    }

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading) return;
        
        const newHistory = [...messages, { role: 'user', parts: [{text: userInput}]}];
        setMessages(newHistory);
        setUserInput('');
        setIsLoading(true);

        const systemPrompt = "You are a calm, supportive, and empathetic AI companion. Your user is seeking a safe space to talk about their feelings, potentially related to PTSD or high stress. Your primary goals are: 1. Listen actively and validate their feelings without judgment. 2. If they express severe distress, gently guide them to use the app's 'Crisis Alert' feature or contact a professional resource from the 'Resources' tab. 3. Do NOT provide medical advice. 4. Keep responses concise and caring. Start your response now."
        const responseText = await generateGeminiContent(`${systemPrompt}\n\nMy current thought: ${userInput}`, newHistory);
        
        if (responseText) {
            setMessages(prev => [...prev, {role: 'model', parts: [{text: responseText}]}]);
        } else {
            addNotification({id: Date.now().toString(), type: 'error', message: "I'm having a little trouble connecting right now. Please try again in a moment."});
            setMessages(prev => prev.slice(0, -1)); // remove the user's message if AI fails
        }
        setIsLoading(false);
    };

    return (
        <div className="flex flex-col items-center justify-center h-full w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl mx-auto my-4">
            <h3 className="text-xl font-semibold mb-4 flex items-center"><Headphones className="mr-2 text-teal-300"/>Wellbeing Chat</h3>
            {circle.length === 0 ? ( <p className="text-gray-400">Add friends to your circle to request a chat.</p>
            ) : (
                <div className="space-y-4 w-full">
                    <select value={selectedFriend} onChange={e => setSelectedFriend(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="" disabled>Select a friend to call...</option>
                        {circle.map(friend => (<option key={friend.id} value={friend.id}>{friend.name}</option>))}
                    </select>
                    <button onClick={handleRequest} disabled={!selectedFriend} className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <Phone size={20}/>
                        <span>Request Chat</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function EnhancedStatusCheckSender({ circle, addNotification, sendSystemNotification }) {
    const [selectedFriend, setSelectedFriend] = useState('');
    const [messageTopic, setMessageTopic] = useState('');
    const [generatedMessage, setGeneratedMessage] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateMessage = async () => {
        if (!messageTopic.trim()) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please enter a topic for the message.' }); return; }
        setIsGenerating(true);
        setGeneratedMessage('');
        const prompt = `You are a caring friend. Based on the following theme, write one short, warm, and supportive check-in message (under 25 words) to send to a friend. Theme: '${messageTopic}'. Respond with only the message itself, without any extra text or quotation marks.`;
        const result = await generateGeminiContent(prompt);
        if (result) { setGeneratedMessage(result.trim()); } 
        else { addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not generate message. Try again.' }); }
        setIsGenerating(false);
    };

    const handleSend = async () => {
        if (!selectedFriend) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please select a friend.' }); return; }
        if (!generatedMessage.trim()) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please generate a message first.' }); return; }
        try {
            // START OF DEBUGGING ADDITION (Enhanced Status Check Send)
            console.log("DEBUG: Sending enhanced status check to:", selectedFriend, " message:", generatedMessage);
            // END OF DEBUGGING ADDITION
            await sendSystemNotification(selectedFriend, generatedMessage, 'check-in');
            addNotification({ id: Date.now().toString(), type: 'success', message: 'Status check sent!' });
            setSelectedFriend(''); setMessageTopic(''); setGeneratedMessage('');
        } catch (error) { console.error("Error sending status check:", error); addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not send status check.' }); }
    };
    
    return (
        <div className="flex flex-col items-center justify-center h-full w-full max-w-md p-6 bg-gray-800 rounded-2xl shadow-xl mx-auto my-4">
            <h3 className="text-xl font-semibold mb-4 flex items-center"><Sparkles className="mr-2 text-yellow-300"/>AI-Assisted Status Check</h3>
            {circle.length === 0 ? ( <p className="text-gray-400">Add friends to your circle to send them a status check.</p>
            ) : (
                <div className="space-y-4 w-full">
                    <select value={selectedFriend} onChange={e => setSelectedFriend(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="" disabled>Select a friend to call...</option>
                        {circle.map(friend => (<option key={friend.id} value={friend.id}>{friend.name}</option>))}
                    </select>
                    <div className="flex space-x-2 w-full">
                        <input type="text" value={messageTopic} onChange={e => setMessageTopic(e.target.value)} placeholder="2. Message topic (e.g., 'gentle check-in')" className="flex-grow bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                        <button onClick={handleGenerateMessage} disabled={isGenerating} className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center disabled:bg-yellow-800">
                             {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div> : <Sparkles size={20}/>}
                        </button>
                    </div>
                    {generatedMessage && ( <div className="bg-gray-700 p-3 rounded-lg w-full"> <p className="text-gray-300 italic">"{generatedMessage}"</p> </div> )}
                    <button onClick={handleSend} disabled={!generatedMessage || !selectedFriend} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        <Send size={20}/>
                        <span>3. Send Message</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function CrisisModal({ alert, onRespond }) {
    const [guidance, setGuidance] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateGuidance = async () => {
        setIsGenerating(true);
        setGuidance('');
        const prompt = "A friend has sent a crisis alert indicating they are experiencing extreme distress, possibly a PTSD episode. As a mental health first aid expert, provide 3 brief, actionable tips for the person who is about to respond. The tips should be supportive, non-judgemental, and focus on immediate de-escalation and safety. Start with 'Remember:'.";
        const result = await generateGeminiContent(prompt);
        if (result) { setGuidance(result); } 
        else { setGuidance("Could not load tips. Focus on listening and showing you care."); }
        setIsGenerating(false);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-red-900 border-4 border-red-500 rounded-2xl p-8 max-w-lg w-full text-center shadow-2xl animate-pulse-intense">
                <AlertTriangle className="mx-auto text-red-300 h-24 w-24 mb-4" />
                <h2 className="text-4xl font-extrabold text-white mb-2">CRISIS ALERT</h2>
                <p className="text-2xl text-red-200 mb-6"> <span className="font-bold">{alert.fromUser.name}</span> needs help now. </p>
                <button onClick={() => onRespond(alert)} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-8 rounded-lg text-2xl transition-transform transform hover:scale-105"> I Can Help </button>
                <div className="mt-6">
                    <button onClick={handleGenerateGuidance} disabled={isGenerating} className="text-sm text-indigo-200 hover:text-white bg-indigo-800/50 hover:bg-indigo-700/50 font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 w-full">
                        {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <> <BrainCircuit size={16}/> <span>How to Help</span> </>}
                    </button>
                    {guidance && <div className="text-left text-sm mt-3 text-indigo-100 bg-black/20 p-3 rounded-md">{guidance}</div>}
                </div>
            </div>
        </div>
    );
}

function ActiveAlertCard({ alert, onCancel, addNotification }) {
    const [groundingExercise, setGroundingExercise] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateExercise = async () => {
        setIsGenerating(true); setGroundingExercise('');
        const prompt = "You are an expert in mindfulness. Generate a simple grounding exercise for someone in intense anxiety. It must be short, easy, and focus on the senses. Use simple numbered steps. Do not include a preamble.";
        const result = await generateGeminiContent(prompt);
        if (result) { setGroundingExercise(result); } 
        else { addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not generate exercise.' }); }
        setIsGenerating(false);
    };

    return (
        <div className="w-full p-6 bg-gray-800 rounded-2xl shadow-xl border-2 border-yellow-500 text-center space-y-4">
            <div>
                <div className="animate-pulse flex justify-center items-center text-yellow-400 mb-2"> <AlertTriangle size={24} className="mr-2"/> <p className="font-bold">ALERT SENT</p> </div>
                <p className="text-lg text-gray-300"> Your circle has been notified. </p>
                {alert.status === 'acknowledged' && ( <div className="bg-green-800/50 p-3 rounded-lg mt-4"> <p className="font-bold text-green-300">{alert.responder.name} is responding!</p> </div> )}
            </div>
            <div className="bg-gray-700/50 p-4 rounded-lg">
                <button onClick={handleGenerateExercise} disabled={isGenerating} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:bg-indigo-900">
                    {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <> <BrainCircuit size={16}/> <span>Show a Calming Exercise</span> </>}
                    </button>
                {groundingExercise && ( <div className="text-left text-sm mt-4 text-indigo-100 bg-black/20 p-3 rounded-md">{groundingExercise}</div> )}
            </div>
            <button onClick={() => onCancel()} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors"> I'm OK Now (Cancel Alert) </button>
        </div>
    );
}

function DailyStatusSelector({ currentStatus, onStatusChange }) {
    const statuses = [
        {
