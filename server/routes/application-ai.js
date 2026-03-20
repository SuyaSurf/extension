/**
 * Application AI API Routes
 * Provides AI-powered content generation for form filling
 */

import { FastifyInstance } from 'fastify';
import { OpenAI } from 'openai';

async function applicationAIRoutes(fastify) {
  // Initialize OpenAI client
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Generate application content
  fastify.post('/api/ai/generate-application', async (request, reply) => {
    try {
      const { applicationType, formRequirements, userProfile, context } = request.body;

      // Validate required fields
      if (!applicationType || !formRequirements || !userProfile) {
        return reply.status(400).send({
          error: 'Missing required fields: applicationType, formRequirements, userProfile'
        });
      }

      // Build the prompt based on application type
      const prompt = buildPrompt(applicationType, formRequirements, userProfile, context);

      // Generate content using OpenAI
      const completion = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at writing professional applications, forms, and responses. Generate high-quality, contextual content that matches the user\'s profile and the specific requirements of each form field.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.7,
      });

      const generatedContent = completion.choices[0]?.message?.content || '';

      // Parse and structure the response
      const structuredContent = parseGeneratedContent(generatedContent, formRequirements);

      return reply.send({
        success: true,
        content: structuredContent,
        confidence: 0.85,
        suggestions: [
          'Review generated content for accuracy',
          'Customize tone to match company culture',
          'Add specific examples from your experience'
        ],
        metadata: {
          applicationType,
          fieldCount: formRequirements.fields?.length || 0,
          processingTime: Date.now()
        }
      });

    } catch (error) {
      console.error('AI generation error:', error);
      
      // Fallback to basic content generation
      const fallbackContent = generateFallbackContent(request.body);
      
      return reply.send({
        success: true,
        content: fallbackContent,
        confidence: 0.5,
        suggestions: ['AI service unavailable - using basic profile data'],
        error: 'AI service temporarily unavailable'
      });
    }
  });

  // Get form analysis
  fastify.post('/api/ai/analyze-form', async (request, reply) => {
    try {
      const { formFields, url } = request.body;

      const analysis = {
        formType: classifyFormType(formFields),
        complexity: calculateComplexity(formFields),
        estimatedTime: estimateFillTime(formFields),
        recommendations: generateRecommendations(formFields),
        confidence: 0.9
      };

      return reply.send({
        success: true,
        analysis
      });

    } catch (error) {
      console.error('Form analysis error:', error);
      return reply.status(500).send({
        error: 'Failed to analyze form'
      });
    }
  });

  // Helper functions
  function buildPrompt(applicationType, formRequirements, userProfile, context) {
    const { fields } = formRequirements;
    
    let prompt = `Generate professional content for a ${applicationType.replace('_', ' ')} application.\n\n`;
    
    prompt += `User Profile:\n`;
    prompt += `- Name: ${userProfile.personalInfo?.firstName || ''} ${userProfile.personalInfo?.lastName || ''}\n`;
    prompt += `- Email: ${userProfile.personalInfo?.email || ''}\n`;
    prompt += `- Phone: ${userProfile.personalInfo?.phone || ''}\n`;
    
    if (userProfile.workExperience?.length > 0) {
      prompt += `- Experience: ${userProfile.workExperience[0]?.company || ''} - ${userProfile.workExperience[0]?.position || ''}\n`;
    }
    
    if (userProfile.skills?.technical?.length > 0) {
      prompt += `- Technical Skills: ${userProfile.skills.technical.slice(0, 5).join(', ')}\n`;
    }

    prompt += `\nForm Requirements:\n`;
    fields.forEach(field => {
      prompt += `- ${field.primaryLabel || field.name}: ${field.inputClass}${field.required ? ' (required)' : ''}\n`;
    });

    prompt += `\nContext:\n`;
    prompt += `- URL: ${context?.url || 'Unknown'}\n`;
    prompt += `- Page Title: ${context?.title || 'Unknown'}\n`;

    prompt += `\nGenerate appropriate content for each field. For text/textarea fields, provide complete, well-written responses. For select/radio fields, suggest the most appropriate option. Return the response in JSON format with field names as keys.`;

    return prompt;
  }

  function parseGeneratedContent(content, formRequirements) {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(content);
      return parsed;
    } catch (e) {
      // If not JSON, extract content based on field labels
      const result = {};
      const lines = content.split('\n');
      
      formRequirements.fields?.forEach(field => {
        const label = field.primaryLabel || field.name;
        const matchingLine = lines.find(line => 
          line.toLowerCase().includes(label.toLowerCase()) ||
          line.toLowerCase().includes(field.semanticType?.toLowerCase() || '')
        );
        
        if (matchingLine) {
          // Extract the actual content after the label
          const contentValue = matchingLine.split(':')[1]?.trim() || matchingLine.trim();
          result[field.semanticType || label] = contentValue;
        }
      });

      return result;
    }
  }

  function generateFallbackContent(requestBody) {
    const { userProfile } = requestBody;
    const content = {};

    // Extract basic profile information
    if (userProfile.personalInfo) {
      Object.assign(content, userProfile.personalInfo);
    }

    // Add basic cover letter template
    content.message = `Dear Hiring Manager,

I am writing to express my interest in this position. With my background and experience, I believe I would be a valuable addition to your team. I am excited about the opportunity to contribute to your organization and grow professionally.

Thank you for your consideration.

Best regards,
${userProfile.personalInfo?.firstName || ''} ${userProfile.personalInfo?.lastName || ''}`;

    return content;
  }

  function classifyFormType(fields) {
    const fieldText = fields.map(f => 
      (f.labels?.join(' ') + ' ' + f.name + ' ' + f.id).toLowerCase()
    ).join(' ');

    if (fieldText.includes('job') || fieldText.includes('employment') || fieldText.includes('position')) {
      return 'job_application';
    }
    if (fieldText.includes('grant') || fieldText.includes('funding') || fieldText.includes('proposal')) {
      return 'grant_application';
    }
    if (fieldText.includes('application') || fieldText.includes('apply')) {
      return 'application';
    }

    return 'general_form';
  }

  function calculateComplexity(fields) {
    let complexity = 0;
    
    fields.forEach(field => {
      if (field.required) complexity += 2;
      if (field.inputClass === 'richText') complexity += 3;
      if (field.inputClass === 'select') complexity += 1;
      if (field.inputClass === 'file') complexity += 2;
      if (field.isCustomDropdown) complexity += 2;
      complexity += 1;
    });
    
    if (complexity < 5) return 'simple';
    if (complexity < 15) return 'moderate';
    return 'complex';
  }

  function estimateFillTime(fields) {
    const baseTime = 500; // Base time in ms
    const perFieldTime = 150;
    return baseTime + (fields.length * perFieldTime);
  }

  function generateRecommendations(fields) {
    const recommendations = [];
    
    const hasMessageField = fields.some(f => f.semanticType === 'message');
    if (hasMessageField) {
      recommendations.push('Consider customizing the cover letter for this specific company');
    }

    const hasFileUpload = fields.some(f => f.semanticType === 'file');
    if (hasFileUpload) {
      recommendations.push('Prepare your resume and other documents before submitting');
    }

    const requiredCount = fields.filter(f => f.required).length;
    if (requiredCount > 5) {
      recommendations.push('This form has many required fields - ensure your profile is complete');
    }

    return recommendations;
  }
}

export default applicationAIRoutes;
