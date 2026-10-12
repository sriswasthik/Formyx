import {
  pipeToken,
  QUIZ_PERCENT_VARIABLE,
  QUIZ_SCORE_VARIABLE,
  type Field,
  type Variable,
} from '@formyx/shared';
import { Braces } from 'lucide-react';
import { ActionTooltip } from '@/components/action-tooltip';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** What can be piped into a piece of text. */
export interface PipeSources {
  /** Questions answered before the text shows, numbered as on the canvas. */
  fields: readonly { field: Field; position: number }[];
  variables: readonly Variable[];
  /** The quiz score, on end screens. */
  quiz: boolean;
}

interface InsertVariableProps {
  sources: PipeSources;
  /** Puts the token (such as `{{field:fld_abc}}`) where the caret is. */
  onInsert: (token: string) => void;
  /** What the text is, for the button's name: "Insert into the question". */
  target: string;
}

/**
 * The insert-variable menu: earlier answers and calculated values to pipe into text, shown
 * to respondents as they answer ("Thanks, {{name}}!").
 */
export function InsertVariable({ sources, onInsert, target }: InsertVariableProps) {
  const empty = sources.fields.length === 0 && sources.variables.length === 0 && !sources.quiz;
  const label = `Insert an answer or value into ${target}`;
  return (
    <DropdownMenu>
      <ActionTooltip
        label={empty ? 'No earlier answers or values yet' : 'Insert an answer or value'}
      >
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={label}
            disabled={empty}
          >
            <Braces aria-hidden />
          </Button>
        </DropdownMenuTrigger>
      </ActionTooltip>
      <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
        {sources.fields.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Answers</DropdownMenuLabel>
            {sources.fields.map(({ field, position }) => (
              <DropdownMenuItem
                key={field.id}
                onSelect={() => {
                  onInsert(pipeToken('field', field.id));
                }}
              >
                <span className="truncate">
                  {position}. {field.label.trim() || 'Untitled question'}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
        {sources.variables.length > 0 && (
          <>
            {sources.fields.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              <DropdownMenuLabel>Values</DropdownMenuLabel>
              {sources.variables.map((variable) => (
                <DropdownMenuItem
                  key={variable.id}
                  onSelect={() => {
                    onInsert(pipeToken('var', variable.id));
                  }}
                >
                  <span className="truncate">{variable.name.trim() || 'Untitled value'}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}
        {sources.quiz && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Quiz</DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() => {
                  onInsert(pipeToken('var', QUIZ_SCORE_VARIABLE));
                }}
              >
                Quiz score
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  onInsert(pipeToken('var', QUIZ_PERCENT_VARIABLE));
                }}
              >
                Quiz score (%)
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
