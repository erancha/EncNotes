import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';
import { Plus, Save, Pencil, Trash2, ArrowLeft, List, Eye, HelpCircle, Search, X, Loader2, Archive, RefreshCw, ArrowRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { renderTableRow, renderNotePreview } from './MarkdownHighlighting';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const CrudOperations = ({ restApiUrl, webSocketApiUrl }) => {
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
  const [isAccessingServer, setIsAccessingServer] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // fetching notes :
  const timeoutIdRef = useRef(null);
  const newTitleInputRef = useRef(null);

  function prepareSearchParams(searchTerm, searchInTitle, searchInContent, caseSensitive, showArchived) {
    let searchParams = { archived: showArchived };
    if (searchTerm) {
      searchParams = {
        ...searchParams,
        searchTerm,
        searchInTitle,
        searchInContent,
        caseSensitive,
      };
    }
    return searchParams;
  }

  const fetchNotes = useCallback(
    async (searchParams = prepareSearchParams(searchTerm, searchInTitle, searchInContent, caseSensitive, showArchived)) => {
      setIsAccessingServer(true);
      try {
        // if there're no notes, and we're not during search, and we're in archive mode, switch automatically to adding a note:
        const checkNotesCountAndSwitchToAddingNote = () => {
          if (!searchParams.searchTerm && !showArchived) {
            setShowSearchPane(false);
            setSearchTerm('');
            setIsAddingNote(true);
          }
        };

        const { tokens } = await fetchAuthSession();
        let response = await axios.get(`${restApiUrl}/list`, {
          headers: { Authorization: `Bearer ${tokens.idToken}` },
          params: searchParams,
        });
        if (response.data.length > 0) {
          const sortedNotes = response.data
            .filter((note) => (showArchived ? note.archived : !note.archived))
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
          setNotes(sortedNotes);
          if (sortedNotes.length === 0) checkNotesCountAndSwitchToAddingNote();
        } else {
          setNotes([]);
          checkNotesCountAndSwitchToAddingNote();
        }
      } catch (error) {
        console.error('Error fetching notes:', error);
        toast.error('Failed to fetch notes');
      } finally {
        setIsAccessingServer(false);
      }
    },
    [restApiUrl, searchTerm, searchInTitle, searchInContent, caseSensitive, showArchived]
  );

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
    debouncedFetchNotes(prepareSearchParams(searchTerm, searchInTitle, searchInContent, caseSensitive));
  }, [debouncedFetchNotes, searchTerm, searchInTitle, searchInContent, caseSensitive]);

  // WebSocket connections :
  const socketRef = useRef(null);
  const lastMessage = useRef('');
  useEffect(() => {
    const connectWebSocket = async () => {
      try {
        const { tokens } = await fetchAuthSession();
        socketRef.current = new WebSocket(`${webSocketApiUrl}?token=${tokens.idToken}`);

        socketRef.current.onopen = () => {
          console.log('WebSocket Connected');
        };

        socketRef.current.onmessage = (event) => {
          // console.log('Received message:', event.data);
          try {
            const data = JSON.parse(event.data);
            if (data.message && data.message !== lastMessage.current) {
              if (data.command?.refresh) fetchNotes(); //TODO: In case this is an update from the current client, this fetch is redundant.
              toast(data.message, { autoClose: Math.max(Math.min(data.message.length * 75, 6000), 2000) });
              lastMessage.current = data.message;
            }
          } catch (err) {
            console.error('Error parsing message:', err);
          }
        };

        socketRef.current.onerror = (error) => {
          console.error('WebSocket error:', error);
          socketRef.current = null;
        };

        socketRef.current.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          if (event.code === 1005) socketRef.current = null;
          else
            setTimeout(() => {
              socketRef.current = null;
            }, 1000);
        };
      } catch (err) {
        console.error('Error creating WebSocket:', err);
        socketRef.current = null;
      }
    };

    if (!socketRef.current) connectWebSocket();
  });

  // adding, updating, archiving, restoring and deleting notes :
  const addNote = async () => {
    if (!newTitle) return;

    setIsAccessingServer(true);
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
      setIsAccessingServer(false);
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
    if (!editingTitle || !editingNote) return;

    setIsAccessingServer(true);
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
      setIsAccessingServer(false);
    }
  };

  const restoreNote = async (note) => {
    setIsAccessingServer(true);
    try {
      const { tokens } = await fetchAuthSession();
      await axios.put(`${restApiUrl}/update/${note.id}`, { archived: false }, { headers: { Authorization: `Bearer ${tokens.idToken}` } });
      fetchNotes();
    } catch (error) {
      console.error('Error restoring a note:', error);
      toast.error('Failed to restore a note');
    } finally {
      setIsAccessingServer(false);
    }
  };

  const deleteNote = async (id) => {
    setIsAccessingServer(true);
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
      setIsAccessingServer(false);
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

  const renderHeaderButtons = () => (
    <div className='header-buttons'>
      <>
        {!showArchived && (
          <button
            onClick={() => {
              setIsAddingNote(true);
              setTimeout(() => {
                if (newTitleInputRef.current) newTitleInputRef.current.focus();
              }, 500);
            }}
            className={`icon-button ${notes.length === 0 && !searchTerm && !showArchived ? 'flash' : ''}`}
            title='Add New Note'
            disabled={showArchived}>
            <Plus size={20} />
            <span className='sr-only'>Add New Note</span>
          </button>
        )}
        <span className={`notes-count${notes.length === 0 && !isAccessingServer ? ' no-notes' : ''}`}>{notes && notes.length} notes</span>
        {notes.length > 0 && (
          <button onClick={toggleViewMode} className='icon-button' title={`Switch to ${viewMode === 'table' ? 'Preview' : 'Table'} View`}>
            {<ArrowRight size={10} />}
            {viewMode === 'table' ? <Eye size={20} /> : <List size={20} />}
            <span className='sr-only'>Switch View</span>
          </button>
        )}
        <button
          onClick={() => {
            setShowArchived(!showArchived);
            setIsAddingNote(false);
          }}
          className={`icon-button ${showArchived ? 'active' : 'archive'}`}
          title={`Switch to ${showArchived ? 'Active' : 'Archived'} Notes`}>
          <ArrowRight size={10} />
          {showArchived ? <RefreshCw size={20} /> : <Archive size={20} />}
          <span className='sr-only'>{showArchived ? 'Show Active Notes' : 'Show Archived Notes'}</span>
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
    </div>
  );

  const LoadingSpinner = () => (
    <div className='flex items-center justify-center w-full h-32'>
      <Loader2 className='w-8 h-8 animate-spin text-blue-500 spinner' />
    </div>
  );

  const actions = {
    startEditingNote,
    restoreNote,
    deleteNote,
  };

  const icons = {
    Pencil,
    RefreshCw,
    Archive,
    Trash2,
  };

  return (
    <div className={`CrudOperationsContainer ${isAccessingServer && !searchTerm ? 'CrudOperationsContainer--loading' : ''}`}>
      <ToastContainer limit={1} />
      {isAccessingServer && !searchTerm && <LoadingSpinner />}
      <div className='CrudOperations'>
        {renderHeaderButtons()}
        {!editingNote && (
          <>
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
                <input
                  type='text'
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder='Enter a new note title'
                  ref={newTitleInputRef}
                />
                <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder='Enter a new note content' rows={10} />
                <div className='add-note-form-buttons'>
                  {notes.length > 0 && (
                    <button
                      onClick={() => {
                        if (
                          (newTitle.trim() === '' && newNote.trim() === '') ||
                          window.confirm('You have unsaved changes. Are you sure you want to go back to the table?')
                        ) {
                          setIsAddingNote(false);
                          setNewTitle('');
                          setNewNote('');
                        }
                      }}
                      className='icon-button cancel'
                      title='Cancel'>
                      <ArrowLeft size={20} />
                      <span className='sr-only'>Cancel</span>
                    </button>
                  )}
                  {newTitle.trim() !== '' && (
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
        ) : (
          <>
            {viewMode === 'table' ? (
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
                  <tbody>{notes.map((note) => renderTableRow(note, searchTerm, caseSensitive, actions, icons))}</tbody>
                </table>
              </div>
            ) : (
              <div className='preview-container'>{notes.map((note) => renderNotePreview(note, searchTerm, caseSensitive, actions, icons))}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CrudOperations;
