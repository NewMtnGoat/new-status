import React, { useState, useEffect, useRef } from 'react';
import { getFirestore, doc, collection, onSnapshot, addDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { Sparkles, BrainCircuit, Star, Lock, ArrowLeft } from 'lucide-react'; 

// Define appId here (or ensure it's passed as a prop if JournalView is always called within App)
const appId = "status-check-bb7ca"; // IMPORTANT: Ensure this matches your project's appId

// This function needs to be defined globally (outside of any React component function)
// so it's not re-declared on every render of JournalView.
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

// PremiumLock component (copied here for JournalView's internal use)
// In a larger app, this might be in a shared components folder.
const PremiumLock = ({ setCurrentView }) => (
    <div className="text-center p-8 bg-gray-800 rounded-2xl shadow-lg">
        <Star className="mx-auto text-yellow-400 h-16 w-16 mb-4" />
        <h3 className="text-2xl font-bold text-white mb-2">Premium Feature</h3>
        <p className="text-gray-300 mb-6">Unlock this feature and more with a Premium subscription.</p>
        <button onClick={() => setCurrentView('profile')} className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-6 rounded-lg transition-colors">
            Upgrade Now
        </button>
    </div>
);


export default function JournalView({ db, user, addNotification, isPremium, setCurrentView }) {
    const [entries, setEntries] = useState([]);
    const [mood, setMood] = useState('ok');
    const [text, setText] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    // Premium Features State
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [isAsking, setIsAsking] = useState(false);

    useEffect(() => {
        if (db && user) {
            const entriesCollectionPath = `/artifacts/${appId}/users/${user.uid}/journalEntries`;

            // START OF DEBUGGING ADDITION (Journal Listener)
            console.log("DEBUG: Setting up Journal Listener for collection:", entriesCollectionPath);
            console.log("DEBUG: Journal Query: orderBy('createdAt', 'desc')");
            // END OF DEBUGGING ADDITION

            const entriesColRef = collection(db, entriesCollectionPath);
            const q = query(entriesColRef, orderBy("createdAt", "desc"));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                setEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setIsLoading(false);
            }, (error) => { // This error handler is critical and was missing earlier!
                console.error("DEBUG: Journal Listener Error:", error); // Make sure this logs the full error object!
            });
            return () => unsubscribe();
        }
    }, [user, db]);

    const handleAddEntry = async (e) => {
        e.preventDefault();
        if (!text.trim()) { addNotification({id: Date.now().toString(), type:'error', message: 'Entry text cannot be empty.'}); return; }
        setIsSaving(true);
        // START OF DEBUGGING ADDITION (Add Journal Entry)
        console.log("DEBUG: Adding journal entry to path:", `/artifacts/${appId}/users/${user.uid}/journalEntries`);
        console.log("DEBUG: Journal Entry Data:", { mood, text, createdAt: "serverTimestamp()" }); // serverTimestamp() is a function, log it as a string for context
        // END OF DEBUGGING ADDITION
        await addDoc(collection(db, `/artifacts/${appId}/users/${user.uid}/journalEntries`), { mood, text, createdAt: serverTimestamp() });
        setText('');
        setIsSaving(false);
    };

    const handleAskQuestion = async (e) => {
        e.preventDefault();
        if (entries.length < 2) { addNotification({ id: Date.now().toString(), type: 'info', message: 'Need at least 2 entries to ask a question.' }); return; }
        if (!question.trim()) { addNotification({ id: Date.now().toString(), type: 'error', message: 'Please enter a question.' }); return; }
        setIsAsking(true); setAnswer('');
        const recentEntriesText = entries.slice(0, 15).map(e => `On ${new Date(e.createdAt?.seconds * 1000).toLocaleDateString()}, I felt ${e.mood} and wrote: '${e.text}'`).join('\n');
        const prompt = `I am reviewing my journal to understand myself better. Based *only* on the following entries, please answer my question. Do not give medical advice. Be supportive and base your answer strictly on the provided text.\n\nJournal Entries:\n${recentEntriesText}\n\nMy Question: "${question}"`;
        // START OF DEBUGGING ADDITION (AI Question)
        console.log("DEBUG: Sending AI Journal Question. Prompt snippet:", prompt.substring(0, 100) + "...");
        // END OF DEBUGGING ADDITION
        const result = await generateGeminiContent(prompt);
        if (result) { setAnswer(result); }
        else { addNotification({ id: Date.now().toString(), type: 'error', message: 'Could not get an answer.' }); }
        setIsAsking(false);
    };

    return (
        <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold mb-6 text-blue-300">My Private Journal</h2>
            <form onSubmit={handleAddEntry} className="mb-8 p-6 bg-gray-800 rounded-2xl shadow-lg space-y-4">
                <textarea value={text} onChange={e => setText(e.target.value)} placeholder="What's on your mind?" rows="4" className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"></textarea>
                <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                         <label className="text-gray-400">Mood:</label>
                         <select value={mood} onChange={e => setMood(e.target.value)} className="bg-gray-700 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                            <option value="good">Good</option>
                            <option value="ok">OK</option>
                            <option value="bad">Bad</option>
                         </select>
                    </div>
                    <button type="submit" disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors disabled:bg-blue-900">
                        {isSaving ? 'Saving...' : 'Save Entry'}
                    </button>
                </div>
            </form>
            
            <div className="mb-8 p-6 bg-gray-800 rounded-2xl shadow-lg space-y-4">
                <h3 className="text-xl font-semibold text-yellow-300 flex items-center"><Star size={20} className="mr-2"/>Advanced Insights (Premium)</h3>
                {!isPremium ? <PremiumLock setCurrentView={setCurrentView} /> : (
                    <form onSubmit={handleAskQuestion}>
                        <div className="space-y-2">
                            <input type="text" value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask your journal a question..." className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500" />
                            <button type="submit" disabled={isAsking} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center space-x-2 disabled:bg-indigo-900">
                                {isAsking ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <> <BrainCircuit size={16}/><span>Ask</span> </>}
                            </button>
                        </div>
                        {answer && <div className="p-4 bg-indigo-900/50 rounded-lg mt-4 text-indigo-100 whitespace-pre-wrap">{answer}</div>}
                    </form>
                )}
            </div>

            <div className="space-y-4">
                 <h3 className="text-2xl font-semibold text-gray-300 mb-4">Recent Entries</h3>
                {isLoading ? <p>Loading entries...</p> : entries.length === 0 ? <p className="text-gray-400 text-center py-8 bg-gray-800 rounded-xl">No journal entries yet.</p> :
                    entries.map(entry => (
                        <div key={entry.id} className="bg-gray-800 p-4 rounded-lg shadow">
                            <p className="text-sm text-gray-500 mb-2">{new Date(entry.createdAt?.seconds * 1000).toLocaleString()}</p>
                            <p className="text-white whitespace-pre-wrap">{entry.text}</p>
                        </div>
                    ))
                }
            </div>
        </div>
    )
}