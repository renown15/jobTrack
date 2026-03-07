# Mobile Component Test Guide

This guide captures patterns and pitfalls from implementing mobile tests for JobTrack. Follow these guidelines when writing new mobile component tests.

---

## 🤖 AI Assistant Quick Start

**If you're an AI assistant writing tests for this project, follow this workflow to avoid common failures:**

### Step 1: Research BEFORE Writing
1. **Read the component interface** you're testing - check TypeScript props
2. **If wrapping custom components** (MobileCard, ResponsiveDataView), read their source to understand:
   - Exact prop names (`metadata` not `fields`, `avatar` not `icon`)
   - How they render elements (buttons vs Typography vs other)
   - What handlers they expose
3. **Check similar existing tests** - look for import patterns, mock setups

### Step 2: Write Incrementally
1. Start with 2-3 simple tests (rendering, basic props)
2. **Run them** - don't write all 15 tests before first run
3. Fix failures, then add more tests
4. Never batch-write tests without intermediate validation

### Step 3: Debug Efficiently
1. If test fails with "element not found", use actual text/role from error output
2. If multiple tests fail with same error, it's likely a component API mismatch - reread interfaces
3. Check imports: use `fireEvent` (always available) not `userEvent` (requires import)

### Real Example That Failed:
```typescript
// ❌ 7 tests failed because component API was wrong
<MobileCard 
    fields={[...]}           // Wrong: should be `metadata`
    icon={<Icon />}          // Wrong: should be `avatar`
/>

// Test looked for: screen.getByRole('button')
// But MobileCard renders: <Typography onClick={...}>

// ✅ Fixed by reading MobileCard.tsx interface first
<MobileCard 
    metadata={[...]}
    avatar={<Icon />}
    actions={<IconButton>...</IconButton>}  // ReactNode, not array
/>
```

**Time saved by reading interfaces first:** ~10 test iterations ≈ 15 minutes

---

## Test Framework: Vitest (NOT Jest)

**CRITICAL:** This project uses Vitest v3.2.4, not Jest. Common mistakes:

### ❌ Wrong (Jest syntax)
```typescript
jest.fn()
jest.spyOn(api, 'method')
```

### ✅ Correct (Vitest syntax)
```typescript
import { vi } from 'vitest'

vi.fn()
vi.spyOn(api, 'method')
```

## Import Order for Mocks

**Mocks must be declared BEFORE importing the mocked module:**

### ❌ Wrong
```typescript
import useMediaQuery from '@mui/material/useMediaQuery'
vi.mock('@mui/material/useMediaQuery')
```

### ✅ Correct
```typescript
vi.mock('@mui/material/useMediaQuery', () => ({
    default: vi.fn(),
}))

import useMediaQuery from '@mui/material/useMediaQuery'
```

## MUI v5 Style Props

**All style props must be inside the `sx` prop:**

### ❌ Wrong
```typescript
<Box display="flex" alignItems="center" minWidth={200}>
```

### ✅ Correct
```typescript
<Box sx={{ display: 'flex', alignItems: 'center', minWidth: 200 }}>
```

## Common React Testing Patterns

### Rendering Components
```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'

test('renders component', () => {
    render(<MyComponent />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
})
```

### Async Data & Query Mocks
```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as apiClient from '../../src/api/client'

vi.mock('../../src/api/client')

test('fetches data', async () => {
    vi.spyOn(apiClient, 'fetchContacts').mockResolvedValue([
        { contactid: 1, fullname: 'Test User' }
    ])
    
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    })
    
    render(
        <QueryClientProvider client={queryClient}>
            <MyComponent />
        </QueryClientProvider>
    )
    
    await waitFor(() => {
        expect(screen.getByText('Test User')).toBeInTheDocument()
    })
})
```

### User Interactions
```typescript
test('handles click', async () => {
    const user = userEvent.setup()
    render(<MyButton />)
    
    await user.click(screen.getByRole('button', { name: /click me/i }))
    
    expect(mockCallback).toHaveBeenCalled()
})
```

## Mock Module Imports (ES6 vs CommonJS)

**Use ES6 imports after vi.mock() declarations:**

### ❌ Wrong (CommonJS in ES module)
```typescript
vi.mock('../../src/api/client')

test('test', () => {
    const api = require('../../src/api/client')  // Don't use require()
    api.fetchData.mockResolvedValue([])
})
```

### ✅ Correct (ES6 after mock)
```typescript
vi.mock('../../src/api/client')

import * as apiClient from '../../src/api/client'

test('test', () => {
    vi.spyOn(apiClient, 'fetchData').mockResolvedValue([])
})
```

## Testing Mobile Responsive Behavior

### Mocking useMediaQuery
```typescript
import { vi } from 'vitest'

vi.mock('@mui/material/useMediaQuery', () => ({
    default: vi.fn(),
}))

import useMediaQuery from '@mui/material/useMediaQuery'

test('renders mobile view', () => {
    // true = mobile (viewport < breakpoint)
    (useMediaQuery as ReturnType<typeof vi.fn>).mockReturnValue(true)
    
    render(<ResponsiveComponent />)
    
    expect(screen.getByTestId('mobile')).toBeInTheDocument()
})

test('renders desktop view', () => {
    // false = desktop (viewport >= breakpoint)
    (useMediaQuery as ReturnType<typeof vi.fn>).mockReturnValue(false)
    
    render(<ResponsiveComponent />)
    
    expect(screen.getByTestId('desktop')).toBeInTheDocument()
})
```

## Test Execution

### Run All Tests (Non-Watch Mode)
```bash
npm test -- --run
```

### Run Specific Test File
```bash
npm test path/to/test.tsx -- --run
```

### Run Tests in Watch Mode (Dev)
```bash
npm test  # Press 'q' to quit
```

## Known Issues & Warnings

### MUI Menu anchorEl Warning
```
Warning: Failed prop type: Invalid prop `anchorEl` supplied to `Menu`
```
- **Status:** Known React 18 + MUI issue, harmless
- **Action:** Can be ignored (MUI team aware, working on fix)

### Simplify Tests That Use rerender()
If you get "render(...) is not a function" errors with rerender:
```typescript
// Instead of testing viewport changes with rerender:
const { rerender } = render(<Component />)
rerender(<Component />) // May fail in some contexts

// Simplify to just test initial state:
render(<Component />)
expect(screen.getByText('Content')).toBeInTheDocument()
```

## Test Organization

### File Structure
```
tests/
├── mobile/                      # Mobile-specific tests
│   ├── MobileCard.test.tsx
│   ├── MobileContactCard.test.tsx
│   ├── ResponsiveDataView.test.tsx
│   ├── DocumentsModal.test.tsx
│   └── useResponsive.test.tsx
├── hooks/                       # Custom hook tests
│   └── useNavigatorMetrics.test.tsx
├── integration/                 # Integration tests
│   └── api/
│       └── contacts.integration.test.ts
└── pages/                       # Page smoke/integration tests
    └── Navigator.smoke.test.tsx
```

**Component tests can live in two places:**

1. **Colocated** (preferred for feature-specific components):
   ```
   src/components/Hub/__tests__/QuickCreateModal.test.tsx
   ```

2. **Cross-cutting** (for shared/mobile components):
   ```
   tests/mobile/MobileCard.test.tsx
   ```

**❌ DO NOT:**
- Put tests directly in `tests/` root (e.g., `tests/SomeTest.test.tsx`)
- Put tests directly in `src/pages/` (use `src/pages/__tests__/` instead)
- Mix unrelated tests in same directory

**✅ DO:**
- Use subdirectories: `tests/mobile/`, `tests/hooks/`, `tests/integration/`
- Keep mobile tests together in `tests/mobile/`
- Colocate feature-specific tests with their components

### Test Naming
- Component tests: `ComponentName.test.tsx`
- Integration tests: `Feature.integration.test.tsx`
- Hook tests: `useHookName.test.tsx`
- Smoke tests: `Page.smoke.test.tsx`

## Checklist for New Mobile Component

- [ ] Import `{ vi } from 'vitest'` at top
- [ ] Use `vi.mock()` BEFORE imports
- [ ] Mock `useMediaQuery` for responsive behavior
- [ ] **Read interfaces of any custom components you're using (MobileCard, ResponsiveDataView, etc.)**
- [ ] **Verify prop names match the component's TypeScript interface**
- [ ] **Check how the wrapped component renders interactive elements (buttons vs Typography)**
- [ ] Use `sx` prop for all MUI style props
- [ ] Test both mobile and desktop views
- [ ] Use `screen.getByRole()` or `screen.getByTestId()` for queries
- [ ] Add `await waitFor()` for async operations
- [ ] Mock API calls with `vi.spyOn(apiClient, 'method')`
- [ ] Wrap in QueryClientProvider if using react-query
- [ ] **Run tests incrementally - don't write all tests at once**
- [ ] Run `npm test -- --run` to verify

## Testing Components That Wrap Custom Components

**CRITICAL:** When testing a component that uses another custom component (e.g., `MobileDocumentsList` uses `MobileCard`), you MUST understand the wrapped component's API first.

### Pre-Test Checklist

1. **Read the wrapped component's interface** - Check prop types, especially what it actually renders
2. **Verify prop names** - Don't assume names; check the actual TypeScript interface
3. **Understand rendering behavior** - How does the component render clickable items? As buttons? Typography?
4. **Check existing tests** - Look for similar tests of the wrapped component

### Example: Testing Components Using MobileCard

```typescript
// ❌ WRONG - Assumes MobileCard uses `fields` prop
<MobileCard fields={[{ label: 'Type', value: 'PDF' }]} />

// ✅ CORRECT - MobileCard actually uses `metadata` prop
<MobileCard metadata={[{ label: 'Type', value: 'PDF' }]} />
```

### Example: Using ResponsiveDataView

```typescript
// ❌ WRONG - ResponsiveDataView uses desktopView/mobileView props
<ResponsiveDataView
    desktop={<DesktopTable />}
    mobile={<MobileCardList />}
/>

// ✅ CORRECT - Use the correct prop names
<ResponsiveDataView
    desktopView={<DesktopTable />}
    mobileView={<MobileCardList />}
/>
```

### Common Wrapper Component Gotchas

1. **Wrong prop names** - Using `fields` instead of `metadata`, `icon` instead of `avatar`, `desktop`/`mobile` instead of `desktopView`/`mobileView`
2. **Wrong element types in tests** - Expecting `button` when component renders clickable `Typography`
3. **Wrong action format** - Passing action objects instead of ReactNode

### Workflow for Testing Wrapper Components

```typescript
// 1. First, read the wrapped component's interface
// src/components/MobileCard.tsx:
// interface MobileCardProps {
//     metadata: Array<{ label: string; value: string; onClick?: () => void }>
//     avatar: ReactNode
//     actions: ReactNode
// }

// 2. Then write your component to match the API
const MyList = ({ items }) => {
    return items.map(item => (
        <MobileCard
            metadata={[{ label: 'Name', value: item.name }]}  // ✅ metadata, not fields
            avatar={<Icon />}                                   // ✅ avatar, not icon
            actions={<IconButton>Edit</IconButton>}            // ✅ ReactNode, not array
        />
    ))
}

// 3. Write tests based on ACTUAL rendering, not assumptions
test('renders item name', () => {
    render(<MyList items={[{ name: 'Test' }]} />)
    
    // MobileCard renders metadata values as Typography
    expect(screen.getByText('Test')).toBeInTheDocument()  // ✅
    // NOT: screen.getByRole('button', { name: 'Test' })   // ❌
})

test('handles click on metadata with onClick', () => {
    const onClick = vi.fn()
    render(<MobileCard metadata={[{ 
        label: 'Count', 
        value: '3',
        onClick 
    }]} />)
    
    // MobileCard renders clickable metadata as Typography, not button
    const element = screen.getByText('3')
    fireEvent.click(element)
    
    expect(onClick).toHaveBeenCalled()
})
```

### Key Lessons from MobileDocumentsList Tests

**Problem:** 7 tests failed because wrong MobileCard API was used

**Root Cause:** Didn't read MobileCard.tsx interface before implementing

**What Went Wrong:**
- Used `fields` prop (doesn't exist) instead of `metadata`
- Used `icon` prop (doesn't exist) instead of `avatar`
- Expected clickable items to be buttons, but MobileCard renders them as `Typography` with `onClick`
- Tried to use `userEvent` without importing it
- **Used `desktop`/`mobile` props on ResponsiveDataView instead of `desktopView`/`mobileView`**

**Solution:**
1. Read `/src/components/MobileCard.tsx` lines 1-50 to see the interface
2. Check how MobileCard renders metadata (line 260-337): clickable items are Typography
3. Update component to use correct props
4. Update tests to match actual rendering (find by text, not by button role)
5. Use `fireEvent.click()` instead of `userEvent.click()` to avoid import issues

### Testing Interactive Elements in Wrapped Components

```typescript
// When wrapped component renders actions as IconButtons:
test('calls edit handler', () => {
    const onEdit = vi.fn()
    render(<MyList items={[...]} onEdit={onEdit} />)
    
    // Find by aria-label that your component sets
    const editButton = screen.getByLabelText('Edit')
    fireEvent.click(editButton)
    
    expect(onEdit).toHaveBeenCalled()
})

// When wrapped component renders clickable text:
test('calls click handler', () => {
    const onClick = vi.fn()
    render(<MyList items={[{ name: 'Test', onClick }]} />)
    
    // Find by actual text content
    const clickableText = screen.getByText('Test')
    fireEvent.click(clickableText)
    
    expect(onClick).toHaveBeenCalled()
})
```

## Common Pitfalls to Avoid

1. **Don't forget `vi` import** - Tests will fail with "jest is not defined"
2. **Mock before import** - Order matters for vi.mock()
3. **Use sx for styles** - Direct props on Box/Stack trigger warnings
4. **Don't use require()** - Use ES6 imports after vi.mock()
5. **Test isolation** - Use `beforeEach(() => vi.clearAllMocks())`
6. **Destructuring failures** - If rerender fails, simplify the test
7. **Missing awaits** - Async operations need `await waitFor()`
8. **❗NEW: Assuming wrapped component APIs** - ALWAYS read the interface of components you're wrapping before writing tests
9. **❗NEW: Wrong element queries** - Test what's actually rendered, not what you think should be rendered
10. **❗NEW: Wrong ResponsiveDataView props** - Use `desktopView`/`mobileView`, not `desktop`/`mobile`

## Quick Reference: Test Template

```typescript
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import '@testing-library/jest-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock API
vi.mock('../../src/api/client')
import * as apiClient from '../../src/api/client'

// Mock useMediaQuery if needed
vi.mock('@mui/material/useMediaQuery', () => ({
    default: vi.fn(),
}))
import useMediaQuery from '@mui/material/useMediaQuery'

import MyComponent from '../../src/components/MyComponent'

describe('MyComponent', () => {
    let queryClient: QueryClient
    
    beforeEach(() => {
        vi.clearAllMocks()
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
            },
        })
        // Set default mobile state
        (useMediaQuery as ReturnType<typeof vi.fn>).mockReturnValue(true)
    })
    
    test('renders on mobile', () => {
        render(
            <QueryClientProvider client={queryClient}>
                <MyComponent />
            </QueryClientProvider>
        )
        
        expect(screen.getByText('My Component')).toBeInTheDocument()
    })
})
```

## Pro Tips

- Run tests frequently as you build to catch issues early
- Use `screen.debug()` to see the rendered output when debugging
- Check `npm test -- --run 2>&1 | grep -E "(FAIL|Test Files)"` for quick summary
- Keep tests simple and focused - one behavior per test
- Use descriptive test names: `test('shows loading spinner while fetching data')`

---
**Last Updated:** December 2024 (Phase 2 Mobile Implementation)
