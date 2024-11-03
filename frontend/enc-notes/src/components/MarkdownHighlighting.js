import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const options = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour12: false, // This ensures 24-hour format
};

// Highlight component that preserves formatting
const Highlight = ({ children, searchTerm = '', caseSensitive = false }) => {
  if (!searchTerm) return children;

  // Helper function to highlight text
  const highlightText = (text) => {
    const parts = text.split(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, caseSensitive ? 'g' : 'gi'));

    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === searchTerm.toLowerCase() ? (
            <mark key={i} className='bg-yellow-200 px-0.5 rounded'>
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  // If children is a string, apply highlighting
  if (typeof children === 'string') {
    return highlightText(children);
  }

  // If children is an array, process each child
  if (Array.isArray(children)) {
    return children.map((child, index) => {
      if (typeof child === 'string') {
        return <React.Fragment key={index}>{highlightText(child)}</React.Fragment>;
      }
      return React.cloneElement(child, { key: index });
    });
  }

  // If children is a React element, return as is
  return children;
};

// Enhanced Markdown components that preserve formatting while highlighting
const createMarkdownComponents = (searchTerm, caseSensitive) => {
  // Helper function to create heading components
  const createHeading = (level) => {
    const Component = `h${level}`;
    return ({ children, ...props }) => (
      <Component {...props}>
        <Highlight searchTerm={searchTerm} caseSensitive={caseSensitive}>
          {children}
        </Highlight>
      </Component>
    );
  };

  return {
    // Text node handler - crucial for plain text
    text: ({ value }) => (
      <Highlight searchTerm={searchTerm} caseSensitive={caseSensitive}>
        {value}
      </Highlight>
    ),

    // Block level components
    p: ({ children, ...props }) => (
      <p {...props}>
        <Highlight searchTerm={searchTerm} caseSensitive={caseSensitive}>
          {children}
        </Highlight>
      </p>
    ),

    // Heading components
    h1: createHeading(1),
    h2: createHeading(2),
    h3: createHeading(3),
    h4: createHeading(4),
    h5: createHeading(5),
    h6: createHeading(6),

    // Inline formatting components
    strong: ({ children, ...props }) => (
      <strong {...props}>
        <Highlight searchTerm={searchTerm} caseSensitive={caseSensitive}>
          {children}
        </Highlight>
      </strong>
    ),

    em: ({ children, ...props }) => (
      <em {...props}>
        <Highlight searchTerm={searchTerm} caseSensitive={caseSensitive}>
          {children}
        </Highlight>
      </em>
    ),

    del: ({ children, ...props }) => (
      <del {...props}>
        <Highlight searchTerm={searchTerm} caseSensitive={caseSensitive}>
          {children}
        </Highlight>
      </del>
    ),

    // List items
    li: ({ children, ...props }) => (
      <li {...props}>
        <Highlight searchTerm={searchTerm} caseSensitive={caseSensitive}>
          {children}
        </Highlight>
      </li>
    ),

    // Code blocks and inline code
    code: ({ children, ...props }) => (
      <code {...props}>
        <Highlight searchTerm={searchTerm} caseSensitive={caseSensitive}>
          {children}
        </Highlight>
      </code>
    ),

    // Add other components as needed
  };
};

const MarkdownWithHighlight = ({ content, searchTerm, caseSensitive }) => {
  const components = createMarkdownComponents(searchTerm, caseSensitive);
  return (
    <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
      {content}
    </ReactMarkdown>
  );
};

// Modified rendering functions with preserved formatting
const renderTableRow = (note, searchTerm, caseSensitive, actions, icons) => {
  const { startEditingNote, restoreNote, deleteNote } = actions;

  return (
    <tr key={note.id}>
      <td>{new Date(note.updatedAt).toLocaleString('en-GB', options)}</td>
      <td>
        <Highlight searchTerm={searchTerm} caseSensitive={caseSensitive}>
          {note.title}
        </Highlight>
      </td>
      <td>
        <MarkdownWithHighlight
          content={note.content.length > 100 ? note.content.substring(0, 100) + '...' : note.content}
          searchTerm={searchTerm}
          caseSensitive={caseSensitive}
        />
      </td>
      <td className='action-buttons'>
        <NoteActionButtons note={note} startEditingNote={startEditingNote} restoreNote={restoreNote} deleteNote={deleteNote} icons={icons} />{' '}
      </td>
    </tr>
  );
};

const renderNotePreview = (note, searchTerm, caseSensitive, actions, icons) => {
  const { startEditingNote, restoreNote, deleteNote } = actions;

  return (
    <div key={note.id} className={`note-preview ${note.archived ? 'archived' : ''}`}>
      <div className='note-preview-header'>
        <span className='note-preview-date'>{new Date(note.updatedAt).toLocaleString('en-GB', options)}</span>
        <h2 className='note-preview-title' title={note.title.length > 50 ? note.title : undefined}>
          <Highlight searchTerm={searchTerm} caseSensitive={caseSensitive}>
            {note.title.length > 50 ? note.title.substring(0, 50) + '..' : note.title}
          </Highlight>
        </h2>
        <div className='note-preview-actions'>
          <NoteActionButtons note={note} startEditingNote={startEditingNote} restoreNote={restoreNote} deleteNote={deleteNote} icons={icons} />{' '}
        </div>
      </div>
      <div className='note-preview-content'>
        <MarkdownWithHighlight content={note.content} searchTerm={searchTerm} caseSensitive={caseSensitive} />
      </div>
    </div>
  );
};

const NoteActionButtons = ({ note, startEditingNote, restoreNote, deleteNote, icons }) => {
  const { Pencil, RefreshCw, Trash2 } = icons;
  return (
    <>
      {!note.archived ? (
        <>
          <button onClick={() => startEditingNote(note)} className='icon-button' title='Edit Note'>
            <Pencil size={20} />
            <span className='sr-only'>Edit</span>
          </button>
          <button onClick={() => deleteNote(note.id)} className='icon-button delete' title='Delete Note'>
            <Trash2 size={20} />
            <span className='sr-only'>Delete</span>
          </button>
        </>
      ) : (
        !note.unrestorable && (
          <button onClick={() => restoreNote(note)} className='icon-button restore' title='Restore Note'>
            <RefreshCw size={20} />
            <span className='sr-only'>Restore</span>
          </button>
        )
      )}
    </>
  );
};

export { renderTableRow, renderNotePreview };
