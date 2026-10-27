import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { recognizeImage } from './ocr';
import { aiReadText, getAiStatus } from './describe';

// Tesseract and the AI service are replaced with fakes, so tests are fast and need no network.
vi.mock('./ocr', () => ({
  recognizeImage: vi.fn(),
  terminateOcr: vi.fn(),
  OcrError: class OcrError extends Error {
    constructor(public code: 'offline' | 'high' | 'generic') {
      super(code);
    }
  },
}));
vi.mock('./smart', async (orig) => ({ ...(await orig<typeof import('./smart')>()), loadDictionary: vi.fn(async () => null) }));
vi.mock('./describe', () => ({
  getAiStatus: vi.fn(async () => ({ enabled: false })),
  describeImage: vi.fn(),
  aiReadText: vi.fn(),
}));

const mockedRecognize = vi.mocked(recognizeImage);
const mockedAiRead = vi.mocked(aiReadText);
const mockedStatus = vi.mocked(getAiStatus);
const image = () => new File(['img'], 'sign.png', { type: 'image/png' });

function upload(file: File) {
  fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });
}

beforeEach(() => {
  mockedRecognize.mockReset();
  mockedAiRead.mockReset();
  mockedStatus.mockReset();
  mockedStatus.mockResolvedValue({ enabled: false });
  document.documentElement.dataset.textSize = 'normal';
  document.documentElement.dataset.contrast = 'normal';
});

describe('App', () => {
  it('extracts text from an uploaded image', async () => {
    mockedRecognize.mockImplementation(async (_file, _opts, onProgress) => {
      onProgress?.({ status: 'recognizing text', progress: 0.5 });
      return { text: 'Hello world.', confidence: 91 };
    });
    render(<App />);
    upload(image());

    expect(await screen.findByText('Hello world.')).toBeInTheDocument();
    expect(mockedRecognize).toHaveBeenCalledWith(
      expect.any(File),
      { language: 'eng', accuracy: 'standard', crop: null, content: 'mixed' },
      expect.any(Function),
    );
    expect(screen.getByText('2 words · clear read')).toBeInTheDocument();
    expect(screen.getByAltText('The image you chose: sign.png')).toBeInTheDocument();
  });

  it('warns when confidence is low', async () => {
    mockedRecognize.mockResolvedValueOnce({ text: 'Blurry words', confidence: 40 });
    render(<App />);
    upload(image());
    expect(await screen.findByText(/some may be wrong/i)).toBeInTheDocument();
  });

  it('shows an error for unsupported files without running OCR', () => {
    render(<App />);
    upload(new File(['text'], 'notes.txt', { type: 'text/plain' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/isn't an image this app can read/i);
    expect(mockedRecognize).not.toHaveBeenCalled();
  });

  it('shows a retryable error when OCR fails', async () => {
    mockedRecognize.mockRejectedValueOnce(new Error('Network down'));
    render(<App />);
    upload(image());
    expect(await screen.findByRole('alert')).toHaveTextContent('Network down');
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('says when no text is found', async () => {
    mockedRecognize.mockResolvedValueOnce({ text: '', confidence: 0 });
    render(<App />);
    upload(image());
    expect((await screen.findAllByText(/no text found/i)).length).toBeGreaterThan(0);
  });

  it('lets you type text to read aloud', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /type or paste text instead/i }));
    await user.type(screen.getByRole('textbox', { name: /edit the text/i }), 'Hi there.');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('Hi there.')).toBeInTheDocument();
    expect(screen.getByText('2 words')).toBeInTheDocument();
  });

  it('shows Arabic text right-to-left', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByLabelText(/language of the text/i), 'ara');
    await user.click(screen.getByRole('button', { name: /type or paste text instead/i }));
    expect(screen.getByRole('textbox', { name: /edit the text/i })).toHaveAttribute('dir', 'rtl');
  });

  it('waits for a selection in manual crop mode', async () => {
    const user = userEvent.setup();
    mockedRecognize.mockResolvedValue({ text: 'Cropped.', confidence: 90 });
    render(<App />);
    await user.click(screen.getByRole('radio', { name: "I'll crop" }));
    upload(image());
    expect(mockedRecognize).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /scan selected area/i }));
    expect(mockedRecognize).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ crop: { x: 0, y: 0, w: 1, h: 1 } }),
      expect.any(Function),
    );
  });

  it('passes automatic cropping and high accuracy to OCR, with a warning', async () => {
    const user = userEvent.setup();
    mockedRecognize.mockResolvedValue({ text: 'Auto.', confidence: 90 });
    render(<App />);
    await user.click(screen.getByRole('radio', { name: 'Automatic' }));
    await user.click(screen.getByRole('radio', { name: 'High accuracy' }));
    expect(screen.getByText(/downloads much larger language files/i)).toBeInTheDocument();
    upload(image());
    expect(mockedRecognize).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ crop: 'auto', accuracy: 'high' }),
      expect.any(Function),
    );
  });

  it('hides AI options when no key is configured', async () => {
    render(<App />);
    await Promise.resolve();
    expect(screen.queryByRole('radio', { name: 'AI' })).not.toBeInTheDocument();
  });

  it('reads with AI when chosen and a key is configured', async () => {
    const user = userEvent.setup();
    mockedStatus.mockResolvedValue({ enabled: true, provider: 'Groq' });
    mockedAiRead.mockResolvedValueOnce('Hi from AI.');
    render(<App />);
    await user.click(await screen.findByRole('radio', { name: 'AI' }));
    upload(image());
    expect(await screen.findByText('Hi from AI.')).toBeInTheDocument();
    expect(mockedAiRead).toHaveBeenCalledWith(expect.any(File), null, 'English', 'mixed');
    expect(mockedRecognize).not.toHaveBeenCalled();
    expect(screen.getByText(/read by Groq/i)).toBeInTheDocument();
  });

  it('changes text size and contrast and remembers them', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('radio', { name: 'Text size 150%' }));
    expect(document.documentElement.dataset.textSize).toBe('larger');
    await user.click(screen.getByRole('radio', { name: 'High' }));
    expect(document.documentElement.dataset.contrast).toBe('high');
    const saved = JSON.parse(localStorage.getItem('openlens.settings.v2') ?? '{}');
    expect(saved).toMatchObject({ textSize: 'larger', highContrast: true });
  });

  it('explains when the browser cannot speak', () => {
    render(<App />);
    expect(screen.getByText(/can't read text aloud/i)).toBeInTheDocument();
  });

  it('has a skip link to the main content', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveAttribute('href', '#main');
  });
});
