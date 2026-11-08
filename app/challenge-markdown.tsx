import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

// Keep HTML disabled and react-markdown's safe URL transform in every view.
export default function ChallengeMarkdown({ children, className = "" }: { children?: string; className?: string }) {
  return <div className={`challenge-markdown ${className}`}>
    <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} skipHtml components={{
      a: ({ children, href, title }) => href ? <a href={href} title={title} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
      // Markdown images can be arbitrary external URLs, with no known dimensions.
      // eslint-disable-next-line @next/next/no-img-element
      img: ({ src, alt, title }) => src ? <img src={src} alt={alt || ""} title={title} loading="lazy" /> : null,
      table: ({ children }) => <div className="markdown-table-scroll"><table>{children}</table></div>,
    }}>{children || ""}</Markdown>
  </div>;
}
