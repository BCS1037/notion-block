export type BlockType = 
    | 'paragraph' | 'h1' | 'h2' | 'h3' 
    | 'bullet' | 'numbered' | 'todo' 
    | 'blockquote' | 'code' | 'math' | 'divider'
    | 'callout' | 'link' | 'embed' | 'attachment' 
    | 'tag' | 'footnote' | 'comment' 
    | 'today' | 'yesterday' | 'tomorrow' | 'time' | 'table' | 'frontmatter';

export interface BlockConfig {
    type: BlockType;
    label: string;
    icon: string;
    template?: string;
}
