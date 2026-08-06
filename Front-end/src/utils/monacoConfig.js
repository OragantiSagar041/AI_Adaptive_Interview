// Monaco Editor Configuration & Custom Completion Item Providers (IntelliSense)

let isConfigured = false

// ── Extract user-defined identifiers from the current document ───────────────
// Scans the full text of the model for valid identifiers (variable names,
// function names, class names, etc.) so they appear in autocomplete even when
// they are not in the static keyword/builtin lists.
// IMPORTANT: Only returns identifiers that start with `currentWord` so Monaco
// never shows a blank suggestion widget when there are 0 prefix matches.
function getDocumentIdentifiers(model, currentWord) {
  try {
    // Need at least 2 characters to avoid flooding the list on every keystroke
    if (!currentWord || currentWord.length < 2) return []
    const prefix = currentWord.toLowerCase()
    const text = model.getValue()
    // Match identifiers: must start with a letter or underscore, followed by word chars
    const identifierRegex = /\b([a-zA-Z_]\w{1,})\b/g
    const seen = new Set()
    const identifiers = []
    let match
    while ((match = identifierRegex.exec(text)) !== null) {
      const word = match[1]
      // Only surface identifiers that:
      //   1. start with what the user is currently typing (prefix match)
      //   2. are not exactly the current word (avoid self-suggestion)
      //   3. have not been added yet (deduplicate)
      if (
        word !== currentWord &&
        word.length > currentWord.length &&
        word.toLowerCase().startsWith(prefix) &&
        !seen.has(word)
      ) {
        seen.add(word)
        identifiers.push(word)
      }
    }
    return identifiers
  } catch {
    return []
  }
}

export const MONACO_EDITOR_OPTIONS = {
  readOnly: false,
  domReadOnly: false,
  cursorBlinking: 'blink',
  cursorStyle: 'line',
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
  fontLigatures: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  lineNumbers: 'on',
  wordWrap: 'on',
  automaticLayout: true,
  tabSize: 4,
  insertSpaces: true,
  padding: { top: 14, bottom: 14 },
  quickSuggestions: {
    other: true,
    comments: true,
    strings: true,
  },
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: 'on',
  tabCompletion: 'on',
  wordBasedSuggestions: 'allDocuments',
  parameterHints: {
    enabled: true,
    cycle: true,
  },
  suggest: {
    showKeywords: true,
    showSnippets: true,
    showFunctions: true,
    showVariables: true,
    showConstants: true,
    showMethods: true,
    showClasses: true,
    showWords: true,
    showStructs: true,
    showInterfaces: true,
    showModules: true,
    filterGraceful: true,
    localityBonus: true,
    shareSuggestSelections: true,
    preview: true,
  },
  snippetSuggestions: 'top',
  autoClosingBrackets: 'always',
  autoClosingQuotes: 'always',
  autoSurround: 'languageDefined',
  formatOnType: true,
  formatOnPaste: true,
}

export function setupMonacoIntelliSense(monaco) {
  if (!monaco || isConfigured) return
  isConfigured = true

  const CompletionItemKind = monaco.languages.CompletionItemKind
  const CompletionItemInsertTextRule = monaco.languages.CompletionItemInsertTextRule

  // ── PYTHON COMPLETIONS ──────────────────────────────────────────────────────────
  try {
    monaco.languages.registerCompletionItemProvider('python', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }

        const keywords = [
          'def', 'return', 'if', 'elif', 'else', 'for', 'in', 'while', 'break', 'continue',
          'try', 'except', 'finally', 'raise', 'with', 'as', 'import', 'from', 'class',
          'lambda', 'pass', 'global', 'nonlocal', 'assert', 'yield', 'async', 'await',
          'True', 'False', 'None', 'is', 'not', 'and', 'or'
        ]

        const builtins = [
          { label: 'print', insertText: 'print(${1:value})', doc: 'Print objects to the text stream file' },
          { label: 'len', insertText: 'len(${1:s})', doc: 'Return the number of items in a container' },
          { label: 'range', insertText: 'range(${1:stop})', doc: 'Return a sequence of numbers from start to stop' },
          { label: 'enumerate', insertText: 'enumerate(${1:iterable})', doc: 'Return an enumerate object yield (index, value)' },
          { label: 'zip', insertText: 'zip(${1:iter1}, ${2:iter2})', doc: 'Iterate over several iterables in parallel' },
          { label: 'sorted', insertText: 'sorted(${1:iterable})', doc: 'Return a new list containing all items from the iterable in ascending order' },
          { label: 'map', insertText: 'map(${1:func}, ${2:iter})', doc: 'Make an iterator that computes the function using arguments from each of the iterables' },
          { label: 'filter', insertText: 'filter(${1:func}, ${2:iter})', doc: 'Construct an iterator from elements of iterable for which function is true' },
          { label: 'sum', insertText: 'sum(${1:iterable})', doc: 'Sum of all items in iterable' },
          { label: 'min', insertText: 'min(${1:arg1}, ${2:arg2})', doc: 'Smallest item in iterable or smallest of two or more arguments' },
          { label: 'max', insertText: 'max(${1:arg1}, ${2:arg2})', doc: 'Largest item in iterable or largest of two or more arguments' },
          { label: 'abs', insertText: 'abs(${1:x})', doc: 'Return the absolute value of a number' },
          { label: 'int', insertText: 'int(${1:x})', doc: 'Convert a number or string to an integer' },
          { label: 'float', insertText: 'float(${1:x})', doc: 'Convert a string or number to a floating point number' },
          { label: 'str', insertText: 'str(${1:object})', doc: 'Create a new string object from the given object' },
          { label: 'bool', insertText: 'bool(${1:x})', doc: 'Returns True when the argument x is true, False otherwise' },
          { label: 'list', insertText: 'list(${1:iterable})', doc: 'Create a new list object' },
          { label: 'dict', insertText: 'dict(${1})', doc: 'Create a new dictionary object' },
          { label: 'set', insertText: 'set(${1:iterable})', doc: 'Create a new set object' },
          { label: 'tuple', insertText: 'tuple(${1:iterable})', doc: 'Create a new tuple object' },
          { label: 'isinstance', insertText: 'isinstance(${1:object}, ${2:classinfo})', doc: 'Return whether an object is an instance of a class' },
          { label: 'all', insertText: 'all(${1:iterable})', doc: 'Return True if bool(x) is True for all values x in the iterable' },
          { label: 'any', insertText: 'any(${1:iterable})', doc: 'Return True if bool(x) is True for any x in the iterable' },
          { label: 'reversed', insertText: 'reversed(${1:sequence})', doc: 'Return a reverse iterator over the values of the given sequence' },
        ]

        const snippets = [
          {
            label: 'def-fn',
            insertText: 'def ${1:func_name}(${2:params}):\n    ${3:pass}',
            doc: 'Define a new function',
          },
          {
            label: 'for-range',
            insertText: 'for ${1:i} in range(${2:n}):\n    ${3:pass}',
            doc: 'For loop over range',
          },
          {
            label: 'for-enumerate',
            insertText: 'for ${1:idx}, ${2:item} in enumerate(${3:items}):\n    ${4:pass}',
            doc: 'For loop with index and value',
          },
          {
            label: 'if-else',
            insertText: 'if ${1:condition}:\n    ${2:pass}\nelse:\n    ${3:pass}',
            doc: 'If-else conditional block',
          },
          {
            label: 'try-except',
            insertText: 'try:\n    ${1:pass}\nexcept ${2:Exception} as ${3:e}:\n    ${4:pass}',
            doc: 'Try-except error handling block',
          },
          {
            label: 'class-solution',
            insertText: 'class Solution:\n    def ${1:solve}(self, ${2:args}):\n        ${3:pass}',
            doc: 'Solution class template',
          },
          {
            label: 'list-comp',
            insertText: '[${1:x} for ${1:x} in ${2:iterable} if ${3:condition}]',
            doc: 'List comprehension',
          },
          {
            label: 'dict-comp',
            insertText: '{${1:k}: ${2:v} for ${1:k}, ${2:v} in ${3:iterable}}',
            doc: 'Dictionary comprehension',
          },
          {
            label: 'import-collections',
            insertText: 'from collections import defaultdict, deque, Counter',
            doc: 'Import common data structures from collections',
          },
          {
            label: 'import-heapq',
            insertText: 'import heapq',
            doc: 'Import heapq module for priority queue operations',
          },
          {
            label: 'import-math',
            insertText: 'import math',
            doc: 'Import math module',
          }
        ]

        // Scan the document for user-defined identifiers (functions, variables, etc.)
        const docIdentifiers = getDocumentIdentifiers(model, word.word)

        const suggestions = [
          ...keywords.map(kw => ({
            label: kw,
            kind: CompletionItemKind.Keyword,
            insertText: kw,
            range,
          })),
          ...builtins.map(b => ({
            label: b.label,
            kind: CompletionItemKind.Function,
            insertText: b.insertText,
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: b.doc,
            range,
          })),
          ...snippets.map(s => ({
            label: s.label,
            kind: CompletionItemKind.Snippet,
            insertText: s.insertText,
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: s.doc,
            range,
          })),
          // User-defined names from the current document
          ...docIdentifiers.map(id => ({
            label: id,
            kind: CompletionItemKind.Variable,
            insertText: id,
            documentation: 'User-defined identifier',
            range,
            sortText: '0' + id, // surfaces user identifiers near the top
          }))
        ]

        return { suggestions }
      }
    })
  } catch (e) {
    console.warn("Python completion provider init failed:", e)
  }

  // ── JAVASCRIPT / TYPESCRIPT COMPLETIONS ──────────────────────────────────────────
  try {
    const jsTsProvider = {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }

        const keywords = [
          'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'do',
          'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'class',
          'extends', 'import', 'export', 'default', 'new', 'this', 'typeof', 'instanceof',
          'async', 'await', 'yield', 'null', 'undefined', 'true', 'false'
        ]

        const builtins = [
          { label: 'console.log', insertText: 'console.log(${1:val})', doc: 'Print to console' },
          { label: 'Math.max', insertText: 'Math.max(${1:a}, ${2:b})', doc: 'Largest of zero or more numbers' },
          { label: 'Math.min', insertText: 'Math.min(${1:a}, ${2:b})', doc: 'Smallest of zero or more numbers' },
          { label: 'Math.floor', insertText: 'Math.floor(${1:x})', doc: 'Largest integer less than or equal to x' },
          { label: 'Math.ceil', insertText: 'Math.ceil(${1:x})', doc: 'Smallest integer greater than or equal to x' },
          { label: 'Math.abs', insertText: 'Math.abs(${1:x})', doc: 'Absolute value of x' },
          { label: 'JSON.stringify', insertText: 'JSON.stringify(${1:obj})', doc: 'Convert JS object to JSON string' },
          { label: 'JSON.parse', insertText: 'JSON.parse(${1:str})', doc: 'Parse JSON string into JS object' },
          { label: 'Object.keys', insertText: 'Object.keys(${1:obj})', doc: 'Return array of property names' },
          { label: 'Object.values', insertText: 'Object.values(${1:obj})', doc: 'Return array of property values' },
          { label: 'Object.entries', insertText: 'Object.entries(${1:obj})', doc: 'Return array of [key, value] pairs' },
          { label: 'Array.from', insertText: 'Array.from(${1:arrayLike})', doc: 'Create a new array from array-like' },
          { label: 'parseInt', insertText: 'parseInt(${1:string}, 10)', doc: 'Parse string into integer' },
          { label: 'parseFloat', insertText: 'parseFloat(${1:string})', doc: 'Parse string into float' },
        ]

        const snippets = [
          {
            label: 'fn-arrow',
            insertText: 'const ${1:funcName} = (${2:params}) => {\n  ${3}\n}',
            doc: 'Arrow function expression',
          },
          {
            label: 'fn-named',
            insertText: 'function ${1:funcName}(${2:params}) {\n  ${3}\n}',
            doc: 'Function declaration',
          },
          {
            label: 'for-of',
            insertText: 'for (const ${1:item} of ${2:iterable}) {\n  ${3}\n}',
            doc: 'For-of loop',
          },
          {
            label: 'for-i',
            insertText: 'for (let ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n  ${3}\n}',
            doc: 'Classic indexed for loop',
          },
          {
            label: 'arr-map',
            insertText: '${1:arr}.map((${2:item}, ${3:index}) => ${4:item})',
            doc: 'Array.prototype.map',
          },
          {
            label: 'arr-filter',
            insertText: '${1:arr}.filter((${2:item}) => ${3:condition})',
            doc: 'Array.prototype.filter',
          },
          {
            label: 'arr-reduce',
            insertText: '${1:arr}.reduce((${2:acc}, ${3:curr}) => {\n  ${4:return acc}\n}, ${5:initialValue})',
            doc: 'Array.prototype.reduce',
          },
        ]

        const docIdentifiers = getDocumentIdentifiers(model, word.word)
        return {
          suggestions: [
            ...keywords.map(kw => ({ label: kw, kind: CompletionItemKind.Keyword, insertText: kw, range })),
            ...builtins.map(b => ({ label: b.label, kind: CompletionItemKind.Function, insertText: b.insertText, insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet, documentation: b.doc, range })),
            ...snippets.map(s => ({ label: s.label, kind: CompletionItemKind.Snippet, insertText: s.insertText, insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet, documentation: s.doc, range })),
            ...docIdentifiers.map(id => ({ label: id, kind: CompletionItemKind.Variable, insertText: id, documentation: 'User-defined identifier', sortText: '0' + id, range }))
          ]
        }
      }
    }

    monaco.languages.registerCompletionItemProvider('javascript', jsTsProvider)
    monaco.languages.registerCompletionItemProvider('typescript', jsTsProvider)
  } catch (e) {
    console.warn("JS/TS completion provider init failed:", e)
  }

  // ── JAVA COMPLETIONS ──────────────────────────────────────────────────────────
  try {
    monaco.languages.registerCompletionItemProvider('java', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }

        const keywords = [
          'public', 'private', 'protected', 'static', 'final', 'void', 'class', 'interface',
          'extends', 'implements', 'new', 'return', 'if', 'else', 'for', 'while', 'do',
          'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'throws',
          'int', 'long', 'double', 'float', 'boolean', 'char', 'byte', 'short', 'String',
          'List', 'ArrayList', 'Map', 'HashMap', 'Set', 'HashSet', 'Queue', 'LinkedList',
          'PriorityQueue', 'Stack', 'Collections', 'Arrays', 'Math'
        ]

        const snippets = [
          { label: 'sout', insertText: 'System.out.println(${1});', doc: 'System.out.println' },
          { label: 'main-method', insertText: 'public static void main(String[] args) {\n    ${1}\n}', doc: 'Main method' },
          { label: 'solution-class', insertText: 'public class Solution {\n    public ${1:int} ${2:solve}(${3:int[] nums}) {\n        ${4:return 0;}\n    }\n}', doc: 'Solution class' },
          { label: 'for-i', insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n    ${3}\n}', doc: 'For loop' },
          { label: 'for-each', insertText: 'for (${1:int} ${2:item} : ${3:items}) {\n    ${4}\n}', doc: 'For-each loop' },
          { label: 'map-new', insertText: 'Map<${1:String}, ${2:Integer}> ${3:map} = new HashMap<>();', doc: 'New HashMap' },
          { label: 'list-new', insertText: 'List<${1:Integer}> ${2:list} = new ArrayList<>();', doc: 'New ArrayList' },
        ]

        const docIdentifiers = getDocumentIdentifiers(model, word.word)
        return {
          suggestions: [
            ...keywords.map(kw => ({ label: kw, kind: CompletionItemKind.Keyword, insertText: kw, range })),
            ...snippets.map(s => ({ label: s.label, kind: CompletionItemKind.Snippet, insertText: s.insertText, insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet, documentation: s.doc, range })),
            ...docIdentifiers.map(id => ({ label: id, kind: CompletionItemKind.Variable, insertText: id, documentation: 'User-defined identifier', sortText: '0' + id, range }))
          ]
        }
      }
    })
  } catch (e) {
    console.warn("Java completion provider init failed:", e)
  }

  // ── C++ COMPLETIONS ──────────────────────────────────────────────────────────
  try {
    monaco.languages.registerCompletionItemProvider('cpp', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }

        const keywords = [
          'int', 'long', 'double', 'float', 'char', 'bool', 'void', 'auto', 'const',
          'vector', 'string', 'map', 'unordered_map', 'set', 'unordered_set', 'pair',
          'queue', 'priority_queue', 'stack', 'algorithm', 'cout', 'cin', 'endl',
          'return', 'if', 'else', 'for', 'while', 'class', 'struct', 'public', 'private',
          'using', 'namespace', 'std', 'include', 'nullptr', 'true', 'false'
        ]

        const snippets = [
          { label: 'cout', insertText: 'std::cout << ${1:val} << std::endl;', doc: 'std::cout print' },
          { label: 'solution-class', insertText: 'class Solution {\npublic:\n    ${1:int} ${2:solve}(${3:vector<int>& nums}) {\n        ${4:return 0;}\n    }\n};', doc: 'Solution class' },
          { label: 'for-i', insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ++${1:i}) {\n    ${3}\n}', doc: 'Indexed for loop' },
          { label: 'for-auto', insertText: 'for (const auto& ${1:x} : ${2:container}) {\n    ${3}\n}', doc: 'Range-based for loop' },
          { label: 'vector-def', insertText: 'std::vector<${1:int}> ${2:vec};', doc: 'Define vector' },
          { label: 'unordered-map-def', insertText: 'std::unordered_map<${1:int}, ${2:int}> ${3:map};', doc: 'Define unordered_map' },
        ]

        const docIdentifiers = getDocumentIdentifiers(model, word.word)
        return {
          suggestions: [
            ...keywords.map(kw => ({ label: kw, kind: CompletionItemKind.Keyword, insertText: kw, range })),
            ...snippets.map(s => ({ label: s.label, kind: CompletionItemKind.Snippet, insertText: s.insertText, insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet, documentation: s.doc, range })),
            ...docIdentifiers.map(id => ({ label: id, kind: CompletionItemKind.Variable, insertText: id, documentation: 'User-defined identifier', sortText: '0' + id, range }))
          ]
        }
      }
    })
  } catch (e) {
    console.warn("C++ completion provider init failed:", e)
  }
}
