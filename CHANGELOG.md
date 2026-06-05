 ## v1.1.0 — 2026-06-05                                                                                                                            
   
  ### New Sections                                                                                                                                  
                                                                                                                                                  
  #### Discovery Credentials                                                                                                                        

  A dedicated page covering all 15 ServiceNow Discovery credential types — SSH Password, SSH Private Key, Windows/WMI, SNMP v1/v2c/v3, VMware, Basic
   Auth, AWS, Azure, GCP, JMX, JDBC, API Key, and External Credential Store.
                                                                                                                                                    
  - Type selector grid with badge-coded cards                                                                                                       
  - Per-type detail panel: configuration fields table, required permissions, CI table types, and usage notes
  - Overview strip explaining credential flow, Credential Affinity, and best practices                                                              
  - Fully indexed in the RAG pipeline (BM25 + semantic) — the AI Assistant now answers questions about credential types, required fields, and     
  privilege escalation                                                                                                                              
   
  #### MID Server                                                                                                                                   
                                                                                                                                                  
  A comprehensive reference page for the Management, Instrumentation, and Discovery Server, organised into 10 navigable sections.

  | Section | Content |
  |---|---|
  | Overview | ECC Queue communication model, key facts |
  | Capabilities | How each ITOM module uses the MID Server (Discovery, Service Mapping, Event Management, Orchestration, ITOM Health,              
  IntegrationHub) |
  | Requirements | Supported OS platforms, hardware sizing guidance, bundled JRE notes |                                                            
  | Network & Ports | Outbound-only model, per-port table for all Discovery probe protocols, proxy support |                                        
  | Security | TLS model, instance service account requirements, credential storage, OS account best practices |
  | Configuration | Full `config.xml` parameter reference with required/optional flags and defaults |                                               
  | MID States | Up, Down, Upgrading, Testing, Stopped, Purged — with visual state cards |                                                          
  | Clustering | Affinity rules, MID Server pools, HA behaviour |
  | Lifecycle | Installation steps, auto-upgrade process, validation procedure |                                                                    
  | Troubleshooting | Six common failure scenarios each with causes and step-by-step resolution |                                                   
   
  Fully indexed in the RAG pipeline across ~22 searchable section documents.                                                                        
                                                                                                                                                  
  ---

  ### Improvements

  #### Navbar                                                                                                                                       
   
  - Fixed link clipping — nav links now render fully at all viewport widths (`navbar-links` no longer competes with `navbar-spacer` for flex space) 
  - Removed the placeholder "Service Mapping — soon" item                                                                                         

  ---

  ### Developer Experience

  #### Report Issue Button

  - Amber-styled button with an animated pulse dot and EKG-line icon, positioned left of the AI Assistant button                                    
  - Links directly to the GitHub Issues page at `karastoyanov/sn-explorer/issues`
  - Hidden on mobile alongside the AI Assistant button                                                                                              
                                                                                                                                                  
  #### GitHub Issue Templates

  Three structured templates added under `.github/ISSUE_TEMPLATE/`:                                                                                 
   
  | Template | Label | Key fields |                                                                                                                 
  |---|---|---|                                                                                                                                   
  | `bug_report.yml` | `bug` | What happened, steps to reproduce, affected section, environment |
  | `data_issue.yml` | `data` | Affected section, what is wrong, correct value or reference |
  | `feature_request.yml` | `enhancement` | Feature description, problem it solves, area of the app |                                               
   
  ---                                                                                                                                               
                                                                                                                                                  
  ## v1.0.0 — 2026-05-01                                                                                                                            
   
  ### Initial Release                                                                                                                               
                                                                                                                                                  
  - Pattern and Classifier browser with full-text search and category filtering
  - Discovery Stages reference (PCIE pipeline) with interactive stage detail cards
  - IRE & Reconciliation Engine reference page
  - AI Assistant with hybrid RAG pipeline — BM25 + semantic search (all-MiniLM-L6-v2) + Reciprocal Rank Fusion, full NDL context indexing (steps,
  relations, CMDB tables)                                                                                                                           
  - Extract scripts for syncing patterns and classifiers from a live ServiceNow instance
  - OpenAI API key stored in `sessionStorage` only — never sent to the backend           