import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';
import { Plus, Save, Pencil, Trash2, ArrowLeft, List, Eye, HelpCircle, Search, X, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const LoadingSpinner = () => (
  <div className='flex items-center justify-center w-full h-32'>
    <Loader2 className='w-8 h-8 animate-spin text-blue-500 spinner' />
  </div>
);

const CrudOperations = ({ restApiUrl, webSocketApiUrl, userDisplayName }) => {
  const [notes, setNotes] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [newNote, setNewNote] = useState('');
  const [editingNote, setEditingNote] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingContent, setEditingContent] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [viewMode, setViewMode] = useState('preview');
  const [showHelp, setShowHelp] = useState(false);
  const [showSearchPane, setShowSearchPane] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInTitle, setSearchInTitle] = useState(true);
  const [searchInContent, setSearchInContent] = useState(true);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const timeoutIdRef = useRef(null);
  const socketRef = useRef(null);

  const fetchNotes = useCallback(
    async (searchParams = prepareSearchParams(searchTerm, searchInTitle, searchInContent, caseSensitive)) => {
      if (!restApiUrl || !userDisplayName) return;

      setIsLoading(true);
      try {
        const { tokens } = await fetchAuthSession();
        let response;
        response = await axios.get(`${restApiUrl}/list`, {
          headers: { Authorization: `Bearer ${tokens.idToken}` },
          params: searchParams,
        });
        if (response.data.length === 0) {
          if (!searchParams.searchTerm) {
            setIsAddingNote(true);
            setShowSearchPane(false);
            setSearchTerm('');
          }
          setNotes([]);
        } else {
          const sortedNotes = response.data.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
          setNotes(sortedNotes);
        }
      } catch (error) {
        console.error('Error fetching notes:', error);
        toast.error('Failed to fetch notes');
      } finally {
        setIsLoading(false);
      }
    },
    [restApiUrl, userDisplayName, searchTerm, searchInTitle, searchInContent, caseSensitive]
  );

  // WebSocket connection setup
  const isConnectingRef = useRef(false);
  useEffect(() => {
    const connectWebSocket = async () => {
      if (webSocketApiUrl && userDisplayName && !socketRef.current && !isConnectingRef.current) {
        try {
          isConnectingRef.current = true;
          const { tokens } = await fetchAuthSession();
          socketRef.current = new WebSocket(`${webSocketApiUrl}?token=${tokens.idToken}`);
          isConnectingRef.current = false;

          socketRef.current.onopen = () => {
            console.log('WebSocket Connected');
          };

          socketRef.current.onmessage = (event) => {
            console.log('Received message:', event.data);
            try {
              const data = JSON.parse(event.data);
              if (data.command?.refresh) fetchNotes(); //TODO: In case this is an update from the current client, this fetch is redundant.
              if (data.message) toast(data.message, { autoClose: Math.max(Math.min(data.message.length * 100, 6000), 3000) });
            } catch (err) {
              console.error('Error parsing message:', err);
            }
          };

          socketRef.current.onerror = (error) => {
            console.error('WebSocket error:', error);
            toast.error('WebSocket connection error');
            isConnectingRef.current = true;
            setTimeout(() => {
              isConnectingRef.current = false;
              socketRef.current = null;
              connectWebSocket();
            }, 10000);
          };

          socketRef.current.onclose = (event) => {
            console.log('WebSocket closed:', event.code, event.reason);
            socketRef.current = null;
            if (event.code === 1005) connectWebSocket();
            else setTimeout(connectWebSocket, 1000);
          };
        } catch (err) {
          console.error('Error creating WebSocket:', err);
          socketRef.current = null;
          toast.error('Failed to establish WebSocket connection');
        }
      }
    };

    connectWebSocket();

    // Cleanup function to close the WebSocket connection on unmount
    return () => {
      if (socketRef.current && !searchTerm) {
        socketRef.current.close();
        socketRef.current = null;
        isConnectingRef.current = false;
      }
    };
  }, [webSocketApiUrl, userDisplayName, fetchNotes, searchTerm]);

  const debouncedFetchNotes = useCallback(
    (searchParams) => {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }

      timeoutIdRef.current = setTimeout(() => {
        fetchNotes(searchParams);
      }, 500);
    },
    [fetchNotes]
  );

  useEffect(() => {
    if (userDisplayName) debouncedFetchNotes(prepareSearchParams(searchTerm, searchInTitle, searchInContent, caseSensitive));
  }, [debouncedFetchNotes, userDisplayName, searchTerm, searchInTitle, searchInContent, caseSensitive]);

  const addNote = async () => {
    if (!newTitle || !newNote || !userDisplayName) return;

    setIsLoading(true);
    try {
      const { tokens } = await fetchAuthSession();
      await axios.post(`${restApiUrl}/add`, { title: newTitle, content: newNote }, { headers: { Authorization: `Bearer ${tokens.idToken}` } });
      setNewTitle('');
      setNewNote('');
      setIsAddingNote(false);
      fetchNotes();
    } catch (error) {
      console.error('Error adding note:', error);
      toast.error('Failed to add note');
    } finally {
      setIsLoading(false);
    }
  };

  const startEditingNote = (note) => {
    setEditingNote(note);
    setEditingTitle(note.title);
    setEditingContent(note.content);
    setHasChanges(false);
  };

  const handleEditChange = (field, value) => {
    if (field === 'title') setEditingTitle(value);
    if (field === 'content') setEditingContent(value);
    setHasChanges(true);
  };

  const updateNote = async () => {
    if (!editingTitle || !editingContent || !userDisplayName || !editingNote) return;

    setIsLoading(true);
    try {
      const { tokens } = await fetchAuthSession();
      await axios.put(
        `${restApiUrl}/update/${editingNote.id}`,
        { title: editingTitle, content: editingContent },
        { headers: { Authorization: `Bearer ${tokens.idToken}` } }
      );
      setEditingNote(null);
      setEditingTitle('');
      setEditingContent('');
      setHasChanges(false);
      fetchNotes();
    } catch (error) {
      console.error('Error updating note:', error);
      toast.error('Failed to update note');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteNote = async (id) => {
    if (userDisplayName && window.confirm('Are you sure you want to delete this note?')) {
      setIsLoading(true);
      try {
        const { tokens } = await fetchAuthSession();
        await axios.delete(`${restApiUrl}/delete/${id}`, {
          headers: { Authorization: `Bearer ${tokens.idToken}` },
        });
        fetchNotes();
      } catch (error) {
        console.error('Error deleting note:', error);
        toast.error('Failed to delete note');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const toggleViewMode = () => {
    setViewMode(viewMode === 'table' ? 'preview' : 'table');
  };

  const toggleHelp = () => {
    setShowHelp(!showHelp);
  };

  const toggleSearchPane = () => {
    setShowSearchPane(!showSearchPane);
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleSearchOptionChange = (option, value) => {
    if (option === 'title') {
      setSearchInTitle(value);
    } else if (option === 'content') {
      setSearchInContent(value);
    } else if (option === 'caseSensitive') {
      setCaseSensitive(value);
    }
  };

  const helpContent = `
### Markdown Support:
This app supports Markdown in note content. Some basic Markdown rules:

- Use \`#\` for headers (e.g., \`# Main Header\`, \`## Subheader\`)
- Use \`*\` for *italics* and \`**\` for **bold**
- Use two spaces for a new line
- Create lists with \`-\` or \`1.\` for numbered lists

For more Markdown tips, check out a [Markdown Cheat Sheet](https://www.markdownguide.org/cheat-sheet/)
 online!
  `;

  const clearSearch = () => {
    setSearchTerm('');
    setSearchInTitle(true);
    setSearchInContent(true);
    setCaseSensitive(false);
  };

  return (
    <div className='CrudOperationsContainer'>
      <ToastContainer />
      {isLoading && !searchTerm ? (
        <LoadingSpinner />
      ) : (
        <div className='CrudOperations'>
          {!editingNote && (
            <>
              <div className='action-buttons'>
                {!isAddingNote && (
                  <>
                    <button
                      onClick={() => setIsAddingNote(true)}
                      className={`icon-button ${notes.length === 0 && !searchTerm ? 'flash' : ''}`}
                      title='Add New Note'>
                      <Plus size={20} />
                      <span className='sr-only'>Add New Note</span>
                    </button>
                    <button onClick={toggleViewMode} className='icon-button' title={`Switch to ${viewMode === 'table' ? 'Preview' : 'Table'} View`}>
                      {viewMode === 'table' ? <Eye size={20} /> : <List size={20} />}
                      <span className='sr-only'>Switch View</span>
                    </button>
                    {(notes.length > 0 || searchTerm) && (
                      <button
                        onClick={toggleSearchPane}
                        className={`icon-button ${showSearchPane && 'search-open'} ${searchTerm && 'search-active'}`}
                        title='Toggle Search'>
                        <Search size={20} />
                        <span className='sr-only'>Toggle Search</span>
                      </button>
                    )}
                    <button onClick={toggleHelp} className='icon-button' title='Toggle Help'>
                      <HelpCircle size={20} />
                      <span className='sr-only'>Toggle Help</span>
                    </button>
                  </>
                )}
              </div>

              {showSearchPane && (
                <div className='search-pane'>
                  <div className='search-input-wrapper'>
                    <input type='text' value={searchTerm} onChange={handleSearchChange} placeholder='Enter search term' className='search-input' />
                    {searchTerm && (
                      <button onClick={clearSearch} className='clear-search' title='Clear Search'>
                        <X size={16} />
                        <span className='sr-only'>Clear Search</span>
                      </button>
                    )}
                  </div>
                  <div className='search-options'>
                    <label>
                      <input type='checkbox' checked={searchInTitle} onChange={(e) => handleSearchOptionChange('title', e.target.checked)} />
                      Search in Title
                    </label>
                    <label>
                      <input type='checkbox' checked={searchInContent} onChange={(e) => handleSearchOptionChange('content', e.target.checked)} />
                      Search in Content
                    </label>
                    <label>
                      <input type='checkbox' checked={caseSensitive} onChange={(e) => handleSearchOptionChange('caseSensitive', e.target.checked)} />
                      Case Sensitive
                    </label>
                  </div>
                </div>
              )}

              {showHelp && (
                <div className='help-content'>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{helpContent}</ReactMarkdown>
                </div>
              )}

              {isAddingNote && (
                <div className='add-note-form'>
                  <input type='text' value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder='Enter a new note title' />
                  <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder='Enter a new note content' rows={10} />
                  <div className='add-note-form-buttons'>
                    <button onClick={() => setIsAddingNote(false)} className='icon-button cancel' title='Cancel'>
                      <ArrowLeft size={20} />
                      <span className='sr-only'>Cancel</span>
                    </button>
                    {newTitle.trim() !== '' && newNote.trim() !== '' && (
                      <button onClick={addNote} className='icon-button flash save-button' title='Save Note'>
                        <Save size={20} />
                        <span className='sr-only'>Save Note</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
          {editingNote ? (
            <div className='edit-note-form'>
              <div className='edit-note-form-buttons'>
                <button
                  onClick={() => {
                    if (!hasChanges || window.confirm('You have unsaved changes. Are you sure you want to go back to the table?')) {
                      setEditingNote(null);
                    }
                  }}
                  className='icon-button cancel'
                  title='Back to Table'>
                  <ArrowLeft size={20} />
                  <span className='sr-only'>Back to Table</span>
                </button>
                {hasChanges && (
                  <button onClick={updateNote} className='icon-button flash save-button' title='Save Changes'>
                    <Save size={20} />
                    <span className='sr-only'>Save Changes</span>
                  </button>
                )}
              </div>
              <div className='edit-note-content'>
                <input type='text' value={editingTitle} onChange={(e) => handleEditChange('title', e.target.value)} placeholder='Note title' />
                <textarea value={editingContent} onChange={(e) => handleEditChange('content', e.target.value)} placeholder='Note content' />
              </div>
            </div>
          ) : viewMode === 'table' ? (
            <div className='table-container'>
              <table>
                <thead>
                  <tr>
                    <th>Updated</th>
                    <th>Title</th>
                    <th>Content</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {notes.map((note) => (
                    <tr key={note.id}>
                      <td>{new Date(note.updatedAt).toLocaleString()}</td>
                      <td>{note.title}</td>
                      <td>{note.content.length > 100 ? note.content.substring(0, 100) + '...' : note.content}</td>
                      <td>
                        <button onClick={() => startEditingNote(note)} className='icon-button' title='Edit Note'>
                          <Pencil size={20} />
                          <span className='sr-only'>Edit</span>
                        </button>
                        <button onClick={() => deleteNote(note.id)} className='icon-button' title='Delete Note'>
                          <Trash2 size={20} />
                          <span className='sr-only'>Delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className='preview-container'>
              {notes.map((note) => (
                <div key={note.id} className='note-preview'>
                  <div className='note-preview-header'>
                    <span className='note-preview-date'>{new Date(note.updatedAt).toLocaleString()}</span>
                    <h2 className='note-preview-title' title={note.title.length > 50 ? note.title : undefined}>
                      {note.title.length > 50 ? note.title.substring(0, 50) + '..' : note.title}
                    </h2>
                    <div className='note-preview-actions'>
                      <button onClick={() => startEditingNote(note)} className='icon-button' title='Edit Note'>
                        <Pencil size={20} />
                        <span className='sr-only'>Edit</span>
                      </button>
                      <button onClick={() => deleteNote(note.id)} className='icon-button' title='Delete Note'>
                        <Trash2 size={20} />
                        <span className='sr-only'>Delete</span>
                      </button>
                    </div>
                  </div>{' '}
                  <div className='note-preview-content'>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.content}</ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function prepareSearchParams(searchTerm, searchInTitle, searchInContent, caseSensitive) {
  let searchParams = {};
  if (searchTerm) searchParams = { searchTerm, searchInTitle, searchInContent, caseSensitive };
  return searchParams;
}

export default CrudOperations;
