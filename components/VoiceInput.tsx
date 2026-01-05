
import React, { useState, useRef, useEffect } from 'react';

interface VoiceInputProps {
  value: string | number;
  onChange: (val: string) => void;
  placeholder?: string;
  type?: 'text' | 'number' | 'textarea';
  className?: string;
  required?: boolean;
  disabled?: boolean;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({ value, onChange, placeholder, type = 'text', className, required, disabled }) => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const initialValueRef = useRef<string | number>('');
  
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'it-IT';

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');
        
        const baseValue = initialValueRef.current.toString();
        let newValue = baseValue + (baseValue.length > 0 && !baseValue.endsWith(' ') ? ' ' : '') + transcript;
        
        if (type === 'number') {
          newValue = newValue.replace(/[^0-9]/g, '');
        }
        
        onChangeRef.current(newValue);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [type]);

  const startListening = (e: React.MouseEvent) => {
    if (disabled) return;
    if (e.button !== 0) return; 
    if (recognitionRef.current && !isListening) {
      initialValueRef.current = value === 0 ? '' : value;
      setIsListening(true);
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.warn("Speech recognition already started");
      }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (disabled) return;
    if (type === 'number' && value === 0) {
      onChange('');
    }
  };

  const commonProps = {
    value: value === 0 && type === 'number' ? '' : value,
    onChange: (e: any) => !disabled && onChange(e.target.value),
    onFocus: handleFocus,
    onMouseDown: startListening,
    onMouseUp: stopListening,
    onMouseLeave: stopListening,
    placeholder: isListening ? 'Ascoltando...' : placeholder,
    required,
    disabled,
    className: `${className} ${isListening ? 'ring-4 ring-indigo-400 bg-indigo-50 animate-pulse' : ''} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} transition-all duration-200`
  };

  if (type === 'textarea') {
    return <textarea {...commonProps} rows={3} />;
  }

  return <input type={type === 'number' ? 'text' : type} {...commonProps} />;
};
