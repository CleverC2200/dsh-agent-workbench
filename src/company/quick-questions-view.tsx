import React, { createContext, useContext } from 'react';
import { buildQuickQuestions, type QuickQuestionSnapshot } from './quick-questions.ts';

export const QuickQuestionsContext = createContext<QuickQuestionSnapshot | null>(null);

export function QuickQuestions({ onFill }: { onFill: (text: string) => void }) {
  const snapshot = useContext(QuickQuestionsContext);
  const questions = buildQuickQuestions(snapshot);
  if (!questions.length) return null;
  return (
    <section className="gea-quick-questions" aria-label="推荐问法">
      <span>{snapshot?.selection === 'selected' ? '围绕所选对象' : '围绕当前页面'}</span>
      <div>
        {questions.map((question) => (
          <button type="button" key={question} onClick={() => onFill(question)}>
            {question}
          </button>
        ))}
      </div>
    </section>
  );
}
