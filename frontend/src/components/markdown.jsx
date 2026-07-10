export const MD_COMPONENTS = {
  p:          ({ children }) => <p className="text-[13px] leading-relaxed mb-2 last:mb-0">{children}</p>,
  strong:     ({ children }) => <strong className="font-semibold text-[#131A15] dark:text-[#E0EAE4]">{children}</strong>,
  em:         ({ children }) => <em className="italic">{children}</em>,
  ul:         ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5 text-[13px]">{children}</ul>,
  ol:         ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5 text-[13px]">{children}</ol>,
  li:         ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1:         ({ children }) => <h1 className="text-[15px] font-bold mb-2 mt-3 first:mt-0 text-[#131A15] dark:text-[#E0EAE4]">{children}</h1>,
  h2:         ({ children }) => <h2 className="text-[14px] font-semibold mb-1.5 mt-3 first:mt-0 text-[#131A15] dark:text-[#E0EAE4]">{children}</h2>,
  h3:         ({ children }) => <h3 className="text-[13px] font-semibold mb-1 mt-2 first:mt-0 text-[#131A15] dark:text-[#E0EAE4]">{children}</h3>,
  a:          ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-[#0C9248] dark:text-[#17C068] underline underline-offset-2 hover:opacity-80">{children}</a>,
  code:       ({ inline, children }) => inline
                ? <code className="font-['IBM_Plex_Mono'] text-[11.5px] px-1 py-0.5 rounded bg-[#EBF0EC] dark:bg-[#0D1410] text-[#0C9248] dark:text-[#17C068]">{children}</code>
                : <code>{children}</code>,
  pre:        ({ children }) => <pre className="font-['IBM_Plex_Mono'] text-[11.5px] leading-relaxed text-[#6EE7B7] bg-[#080E0A] border border-[#142018] rounded-lg px-3 py-2.5 overflow-x-auto mb-2 whitespace-pre-wrap break-words">{children}</pre>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-[#9DDCBA] dark:border-[#1E5035] pl-3 text-[#506458] dark:text-[#4A6858] italic mb-2">{children}</blockquote>,
  hr:         () => <hr className="border-[#D8E2DC] dark:border-[#1A2C22] my-2" />,
  table:      ({ children }) => <div className="overflow-x-auto mb-2"><table className="w-full text-[12px] border-collapse">{children}</table></div>,
  th:         ({ children }) => <th className="text-left px-2 py-1.5 font-semibold text-[#506458] dark:text-[#4A6858] border-b border-[#D8E2DC] dark:border-[#1A2C22] bg-[#F9FAF9] dark:bg-[#172018]">{children}</th>,
  td:         ({ children }) => <td className="px-2 py-1.5 border-b border-[#EBF0EC] dark:border-[#1A2C22] text-[#1E3028] dark:text-[#A8C4B8]">{children}</td>,
}
