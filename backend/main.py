
from langchain_text_splitters import RecursiveCharacterTextSplitter, SentenceTransformersTokenTextSplitter
import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
from pypdf import PdfReader
import google.generativeai as genai
from pprint import pprint
from google.colab import userdata
from IPython.display import Markdown, display

# Load and extract PDF text
reader = PdfReader("/content/Abraham-Silberschatz-Operating-System-Concepts-10th-2018-2.pdf")
pdf_texts = [p.extract_text().strip() for p in reader.pages]
pdf_texts = [text for text in pdf_texts if text]

print(f"Total pages extracted: {len(pdf_texts)}")
print(f"First page preview:")
print("=" * 50)
pprint(pdf_texts[0][:500])

# Document Statistics
total_characters = sum(len(text) for text in pdf_texts)
total_words = sum(len(text.split()) for text in pdf_texts)
print(f"Document Statistics:")
print(f"   Pages: {len(pdf_texts)}")
print(f"   Characters: {total_characters:,}")
print(f"   Words: {total_words:,}")
print(f"   Avg words per page: {total_words // len(pdf_texts)}")

# Character Splitting
character_splitter = RecursiveCharacterTextSplitter(
    separators=["\n\n", "\n", ". ", " ", ""],
    chunk_size=1000,
    chunk_overlap=0
)
full_text = '\n\n'.join(pdf_texts)
character_split_texts = character_splitter.split_text(full_text)

print(f"Character splitting results:")
print(f"   Original pages: {len(pdf_texts)}")
print(f"   New chunks: {len(character_split_texts)}")
print(f"   Average chunk size: {len(full_text) // len(character_split_texts)} characters")

# Token Splitting
token_splitter = SentenceTransformersTokenTextSplitter(
    chunk_overlap=0,
    tokens_per_chunk=256
)
token_split_texts = []
for text in character_split_texts:
    token_split_texts += token_splitter.split_text(text)

print(f"Token splitting results:")
print(f"   Character chunks: {len(character_split_texts)}")
print(f"   Token chunks: {len(token_split_texts)}")
print(f"   Tokens per chunk: ~256")

# Embedding Function
embedding_function = SentenceTransformerEmbeddingFunction()
print("Embedding function created!")
print("This will convert text into 384-dimensional vectors")

# ChromaDB Setup
chroma_client = chromadb.Client()
collection_name = "document_knowledge_base"
chroma_collection = chroma_client.create_collection(
    name=collection_name,
    embedding_function=embedding_function
)

chunk_ids = [str(i) for i in range(len(token_split_texts))]
print(f"Adding {len(token_split_texts)} chunks to database...")
chroma_collection.add(
    ids=chunk_ids,
    documents=token_split_texts
)
total_documents = chroma_collection.count()
print(f"Successfully stored {total_documents} document chunks")

# Gemini Configuration
GEMINI_API_KEY = userdata.get('AIzaSyB6AJdyZI-rdNIra8_mCcYeMPndUVIoWgk')
if not GEMINI_API_KEY:
    print("API key not found!")
else:
    print("API key loaded successfully")
    genai.configure(api_key=GEMINI_API_KEY)
    print("Gemini client configured")

generation_config = {
    "temperature": 0.9,
    "top_p": 1,
    "top_k": 1,
    "max_output_tokens": 2048
}

model = genai.GenerativeModel(
    model_name="gemini-2.0-flash",
    generation_config=generation_config
)
print("optimized model created!")

# Pipeline Functions
def pipeline(query, retrieved_documents, model):
    context = "\n\n---\n\n".join(retrieved_documents)
    prompt = f"""You are a helpful AI assistant that answers questions based on provided documents.
INSTRUCTIONS:
- Use ONLY the information provided in the context below
- If the context doesn't contain enough information, say so clearly
- Be specific and cite relevant details from the context
- Keep responses focused and accurate
- Do not make up information not in the context

CONTEXT:
{context}

QUESTION: {query}
ANSWER:"""
    try:
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        return f"Error generating response: {str(e)}"

def enhanced_pipeline(query, n_results=3):
    if not query.strip():
        return "Please provide a valid question."
    if chroma_collection.count() == 0:
        return "No documents in database. Please add documents first."
    
    print(f"Searching for: '{query}'")
    search_results = chroma_collection.query(
        query_texts=[query],
        n_results=n_results
    )
    retrieved_docs = search_results['documents'][0]
    
    if not retrieved_docs:
        return "No relevant documents found."
        
    print(f"Found {len(retrieved_docs)} relevant chunks")
    response = pipeline(query, retrieved_docs, model)
    return response

# Test Run
test_query = "Summarise about deadlocks"
print("=" * 60)
answer = enhanced_pipeline(test_query)
print(f"Query: {test_query}")
print(f"Answer:")
display(Markdown(answer))