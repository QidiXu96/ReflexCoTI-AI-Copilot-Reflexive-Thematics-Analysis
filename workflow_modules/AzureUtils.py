"""
Module: AzureUtils.py
Description: Contains utility functions for interacting with the Azure OpenAI API  
"""
from openai import AzureOpenAI
from docx import Document

def get_completion(
    messages,
    model,
    client,
    max_tokens=16384,
    temperature=0.7,
    top_p=1,
    frequency_penalty=0,
    presence_penalty=0
):
    # send one request now
    request = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "top_p": top_p,
        "frequency_penalty": frequency_penalty,
        "presence_penalty": presence_penalty
    }
    return client.chat.completions.create(**request)

def make_completion(azure_endpoint, api_key, api_version, model):
    # set up Azure once, reuse it.
    # returned function remembers the Azure client and model, so don’t need to pass them every time.
    client = AzureOpenAI(
        azure_endpoint=azure_endpoint,
        api_key=api_key,
        api_version=api_version
    )

    def complete(messages, **kwargs):
        return get_completion(
            messages=messages,
            model=model,
            client=client,
            **kwargs
        )

    return complete

def read_docx(file_path):
    """
    Extract text from a DOCX file.
    """
    doc = Document(file_path)
    full_text = []
    for paragraph in doc.paragraphs:
        full_text.append(paragraph.text)
    return '\n'.join(full_text)
