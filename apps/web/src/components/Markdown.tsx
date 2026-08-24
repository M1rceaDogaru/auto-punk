import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';

export default function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkBreaks]}>{text}</ReactMarkdown>
    </div>
  );
}
