# Navigator Refactoring Plan

## Current Issues

The Navigator component (~1549 lines) has several testability and maintainability issues:

### 1. **Too Many Responsibilities**
- Document fetching and caching
- Metrics data fetching and transformation
- History management
- Modal state management
- Action execution with complex prompt building
- Toast notifications
- Multiple query orchestration

### 2. **Complex Async Initialization**
- Multiple useEffect hooks with interdependencies
- Force refresh logic on mount
- Document fetching side effects
- Cache preloading from history
- Storage event listeners
- Polling intervals

### 3. **State Management Sprawl**
- 20+ useState declarations
- Multiple useQuery hooks
- Manual cache manipulation
- Tight coupling between state updates

### 4. **Testing Challenges**
- Hard to mock document fetching
- Complex initialization makes setup difficult
- Side effects run automatically
- Tight coupling to API client
- Storage listeners and intervals complicate cleanup

## Refactoring Strategy

### Phase 1: Extract Custom Hooks (Immediate Win)

#### 1.1 `useNavigatorDocuments(applicantId, propDocs)`
```typescript
// Handles document fetching, caching, and type filtering
export function useNavigatorDocuments(applicantId: number, propDocs: any[] = []) {
    const [fetchedDocs, setFetchedDocs] = useState<any[] | null>(null)
    const [loading, setLoading] = useState(false)
    const effectiveDocs = propDocs.length ? propDocs : (fetchedDocs || [])
    
    const getLatestDocByType = useCallback((typeName: string) => {
        // Move logic here
    }, [effectiveDocs])
    
    // Move useEffect logic here
    
    return {
        documents: effectiveDocs,
        loading,
        getLatestDocByType
    }
}
```

**Benefits:**
- Isolated testing of document logic
- Easy to mock in Navigator tests
- Reusable in other components

#### 1.2 `useNavigatorMetrics(applicantId)`
```typescript
// Handles metrics fetching, caching, and history
export function useNavigatorMetrics(applicantId: number) {
    const queryClient = useQueryClient()
    const insightsKey = ['navigator:insights', applicantId]
    
    const { data: insights, isLoading, refetch } = useQuery(
        insightsKey,
        fetchNavigatorInsights,
        { /* config */ }
    )
    
    const [displayedMetrics, setDisplayedMetrics] = useState(insights?.metrics || [])
    const [selectedSnapshot, setSelectedSnapshot] = useState<number | 'latest'>('latest')
    
    const { history, historyLoading } = useMetricHistory()
    
    const loadSnapshot = useCallback(async (snapshotId: number) => {
        // Move snapshot loading logic here
    }, [])
    
    return {
        metrics: displayedMetrics,
        loading: isLoading,
        history,
        selectedSnapshot,
        setSelectedSnapshot,
        loadSnapshot,
        refetch
    }
}
```

**Benefits:**
- Metrics logic testable in isolation
- Clear contract for metric operations
- Easier to mock for UI tests

#### 1.3 `useNavigatorInitialization(applicantId, options)`
```typescript
// Handles the complex mount/initialization logic
export function useNavigatorInitialization(
    applicantId: number,
    options: {
        autoRefresh?: boolean
        preloadFromHistory?: boolean
    }
) {
    const initializedRef = useRef(false)
    const [refreshing, setRefreshing] = useState(false)
    
    useEffect(() => {
        if (initializedRef.current) return
        initializedRef.current = true
        
        const init = async () => {
            if (options.preloadFromHistory) {
                await preloadFromHistory()
            }
            if (options.autoRefresh) {
                await performInitialRefresh()
            }
        }
        
        init()
    }, [applicantId])
    
    return { refreshing, initialized: initializedRef.current }
}
```

**Benefits:**
- Initialization logic can be tested independently
- Easy to disable for tests
- Clear configuration options

#### 1.4 `useNavigatorActions()`
```typescript
// Handles action execution and prompt building
export function useNavigatorActions() {
    const { data: actions = [] } = useQuery(['nav:actions'], fetchNavigatorActions)
    const { data: inputTypes = [] } = useQuery(['refdata', 'NAVIGATOR_INPUT_TYPE'], 
        () => fetchReferenceData('NAVIGATOR_INPUT_TYPE'))
    const { data: prompts = [] } = useQuery(['nav:prompts'], fetchNavigatorPrompts)
    
    const executeAction = useCallback(async (action: any, context: ActionContext) => {
        // Move handleAction logic here
    }, [inputTypes, prompts])
    
    return {
        actions,
        executeAction,
        loading: false // based on queries
    }
}
```

**Benefits:**
- Action execution testable with mocked data
- Separates prompt building complexity
- Easier to test error scenarios

### Phase 2: Split UI Components

#### 2.1 Create Smaller Components
```typescript
// NavigatorMetricsPanel.tsx
export function NavigatorMetricsPanel({ 
    metrics, 
    loading, 
    onMetricClick 
}) {
    // Just renders metrics table/cards
    // No data fetching
}

// NavigatorHistorySelector.tsx
export function NavigatorHistorySelector({ 
    history, 
    selected, 
    onSelect 
}) {
    // Just renders dropdown
}

// NavigatorRefreshButton.tsx
export function NavigatorRefreshButton({ 
    refreshing, 
    onRefresh 
}) {
    // Just renders button
}
```

**Benefits:**
- Each component testable in isolation
- Clear props contracts
- Easier to understand
- Faster test execution

#### 2.2 Main Navigator Becomes Orchestrator
```typescript
export default function Navigator({ applicant, docs = [] }: NavigatorProps) {
    const applicantId = getApplicantId() || applicant?.applicantid
    
    // Use custom hooks
    const { documents, loading: docsLoading, getLatestDocByType } = 
        useNavigatorDocuments(applicantId, docs)
    
    const { metrics, loading: metricsLoading, history, selectedSnapshot, 
            setSelectedSnapshot, loadSnapshot, refetch } = 
        useNavigatorMetrics(applicantId)
    
    const { refreshing } = useNavigatorInitialization(applicantId, {
        autoRefresh: true,
        preloadFromHistory: true
    })
    
    const { actions, executeAction } = useNavigatorActions()
    
    // Modal state (can be extracted to useNavigatorModals)
    const [detailModalOpen, setDetailModalOpen] = useState(false)
    const [insightModalOpen, setInsightModalOpen] = useState(false)
    
    // Simple event handlers
    const handleMetricClick = (metric: any) => { /* ... */ }
    const handleRefresh = () => refetch()
    
    return (
        <Box>
            <NavigatorMetricsPanel 
                metrics={metrics}
                loading={metricsLoading}
                onMetricClick={handleMetricClick}
            />
            
            <NavigatorHistorySelector
                history={history}
                selected={selectedSnapshot}
                onSelect={setSelectedSnapshot}
            />
            
            {/* Other UI components */}
        </Box>
    )
}
```

### Phase 3: Testability Improvements

#### 3.1 Create Test Utilities
```typescript
// test-utils/navigatorTestUtils.ts

export function createMockNavigatorContext() {
    return {
        applicantId: 1,
        documents: [
            { documentid: 1, documenttype: 'cv', documentname: 'resume.pdf' }
        ],
        metrics: [
            { metric: 'total_contacts', value: 42, trend: 'up' }
        ],
        actions: [],
        prompts: []
    }
}

export function renderNavigatorWithMocks(overrides = {}) {
    const context = { ...createMockNavigatorContext(), ...overrides }
    
    // Mock all API calls
    vi.spyOn(apiClient, 'fetchDocuments').mockResolvedValue(context.documents)
    vi.spyOn(apiClient, 'fetchNavigatorInsights').mockResolvedValue({
        metrics: context.metrics
    })
    
    // Return render result with context
    return {
        ...render(<Navigator applicant={{ applicantid: context.applicantId }} />),
        context
    }
}
```

#### 3.2 Write Hook Tests
```typescript
// useNavigatorDocuments.test.ts
describe('useNavigatorDocuments', () => {
    test('fetches documents when not provided', async () => {
        const { result } = renderHook(() => useNavigatorDocuments(1, []))
        
        await waitFor(() => {
            expect(result.current.documents).toHaveLength(3)
        })
    })
    
    test('uses prop documents when provided', () => {
        const mockDocs = [{ documentid: 1 }]
        const { result } = renderHook(() => 
            useNavigatorDocuments(1, mockDocs)
        )
        
        expect(result.current.documents).toBe(mockDocs)
    })
    
    test('getLatestDocByType finds correct document', () => {
        const docs = [
            { documentid: 1, documenttype: 'cv' },
            { documentid: 2, documenttype: 'cover letter' }
        ]
        const { result } = renderHook(() => 
            useNavigatorDocuments(1, docs)
        )
        
        const cvDoc = result.current.getLatestDocByType('cv')
        expect(cvDoc.documentid).toBe(1)
    })
})
```

#### 3.3 Write Component Tests
```typescript
// NavigatorMetricsPanel.test.tsx
describe('NavigatorMetricsPanel', () => {
    test('renders metrics in desktop view', () => {
        const metrics = [
            { metric: 'total_contacts', value: 42, label: 'Total Contacts' }
        ]
        
        render(<NavigatorMetricsPanel metrics={metrics} loading={false} />)
        
        expect(screen.getByText('Total Contacts')).toBeInTheDocument()
        expect(screen.getByText('42')).toBeInTheDocument()
    })
    
    test('shows loading state', () => {
        render(<NavigatorMetricsPanel metrics={[]} loading={true} />)
        
        expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })
})
```

#### 3.4 Integration Tests (Simplified)
```typescript
// Navigator.integration.test.tsx
describe('Navigator Integration', () => {
    test('displays metrics after loading', async () => {
        const { context } = renderNavigatorWithMocks({
            metrics: [{ metric: 'test', value: 10 }]
        })
        
        await waitFor(() => {
            expect(screen.getByText('10')).toBeInTheDocument()
        })
    })
})
```

### Phase 4: Advanced Patterns (Optional)

#### 4.1 Use Context for Shared State
```typescript
// NavigatorContext.tsx
const NavigatorContext = createContext<NavigatorContextType | null>(null)

export function NavigatorProvider({ applicantId, children }) {
    const documents = useNavigatorDocuments(applicantId)
    const metrics = useNavigatorMetrics(applicantId)
    const actions = useNavigatorActions()
    
    return (
        <NavigatorContext.Provider value={{ documents, metrics, actions }}>
            {children}
        </NavigatorContext.Provider>
    )
}

export function useNavigatorContext() {
    const context = useContext(NavigatorContext)
    if (!context) throw new Error('useNavigatorContext outside provider')
    return context
}
```

#### 4.2 State Machine for Initialization
```typescript
// Use XState or similar for complex state
const navigatorMachine = createMachine({
    initial: 'idle',
    states: {
        idle: {
            on: { INIT: 'initializing' }
        },
        initializing: {
            invoke: {
                src: 'loadInitialData',
                onDone: 'ready',
                onError: 'error'
            }
        },
        ready: {
            on: { 
                REFRESH: 'refreshing',
                LOAD_SNAPSHOT: 'loadingSnapshot'
            }
        },
        refreshing: { /* ... */ },
        error: { /* ... */ }
    }
})
```

## Implementation Order

### Week 1: Extract Hooks
1. ✅ Extract `useNavigatorDocuments`
2. ✅ Write tests for `useNavigatorDocuments`
3. ✅ Extract `useNavigatorMetrics`
4. ✅ Write tests for `useNavigatorMetrics`

### Week 2: Component Split
1. ✅ Create `NavigatorMetricsPanel`
2. ✅ Create `NavigatorHistorySelector`
3. ✅ Update Navigator to use new components
4. ✅ Write component tests

### Week 3: Actions Refactor
1. ✅ Extract `useNavigatorActions`
2. ✅ Write tests for action execution
3. ✅ Simplify prompt building logic

### Week 4: Integration & Polish
1. ✅ Write integration tests
2. ✅ Remove test skips
3. ✅ Performance optimization
4. ✅ Documentation

## Success Metrics

- ✅ Navigator component < 300 lines
- ✅ All custom hooks < 100 lines
- ✅ All hooks have unit tests (>80% coverage)
- ✅ Integration tests pass consistently
- ✅ No test skips in Navigator tests
- ✅ Test execution time < 2s for Navigator tests

## Migration Strategy

### Backward Compatibility
- Keep existing Navigator working during migration
- Create NavigatorRefactored.tsx alongside original
- Use feature flag to switch between versions
- Gradual rollout with monitoring

### Rollback Plan
- Keep old Navigator.tsx in git history
- Document any API changes
- Have rollback script ready

## Resources

- [React Hook Patterns](https://react-hooks.org/)
- [Testing React Hooks](https://react-hooks-testing-library.com/)
- [Custom Hook Best Practices](https://kentcdodds.com/blog/react-hooks-what-when-why)

---

**Next Steps:**
1. Review this plan with team
2. Get approval for implementation timeline
3. Start with `useNavigatorDocuments` extraction
4. Write tests first (TDD approach)
5. Gradual rollout with feature flag
