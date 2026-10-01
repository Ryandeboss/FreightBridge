from collections.abc import Iterator
from typing import Annotated
from uuid import UUID

import psycopg
from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.infrastructure.database import DatabaseConnectivityError, connect
from app.infrastructure.training_progress_repository import TrainingProgressRepository
from app.integrations.supabase_auth import (
  AuthenticatedLearner,
  SupabaseAuthClient,
  SupabaseAuthError,
)
from app.models.account import (
  AccountCredentials,
  AccountSessionView,
  AccountUserView,
  CourseProgressView,
  RefreshAccountSessionRequest,
  RegisterAccountResponse,
  UpdateCourseProgressRequest,
)

router = APIRouter(prefix='/api/account', tags=['learner account'])


def get_supabase_auth_client() -> SupabaseAuthClient:
  return SupabaseAuthClient()


def auth_error(exc: SupabaseAuthError) -> HTTPException:
  return HTTPException(
    status_code=exc.status_code,
    detail={'error': {'code': exc.code, 'message': exc.message}},
  )


def progress_dependency_error(message: str) -> HTTPException:
  return HTTPException(
    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    detail={'error': {'code': 'DEPENDENCY_ERROR', 'message': message}},
  )


def get_progress_repository() -> Iterator[TrainingProgressRepository]:
  try:
    with connect() as connection:
      yield TrainingProgressRepository(connection)
  except DatabaseConnectivityError as exc:
    raise progress_dependency_error('Training progress database is temporarily unavailable.') from exc


def require_learner_user(
  authorization: Annotated[str | None, Header(alias='Authorization')] = None,
  auth_client: SupabaseAuthClient = Depends(get_supabase_auth_client),
) -> AuthenticatedLearner:
  if not authorization or not authorization.startswith('Bearer '):
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail={'error': {'code': 'AUTHENTICATION_ERROR', 'message': 'Sign in to continue.'}},
    )
  token = authorization.removeprefix('Bearer ').strip()
  if not token:
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail={'error': {'code': 'AUTHENTICATION_ERROR', 'message': 'Sign in to continue.'}},
    )
  try:
    return auth_client.get_user(token)
  except SupabaseAuthError as exc:
    raise auth_error(exc) from exc


def session_view(payload: dict[str, object]) -> AccountSessionView:
  user = payload.get('user')
  if not isinstance(user, dict):
    raise HTTPException(
      status_code=status.HTTP_502_BAD_GATEWAY,
      detail={'error': {'code': 'DEPENDENCY_ERROR', 'message': 'Account service returned an incomplete session.'}},
    )

  return AccountSessionView.model_validate({
    'accessToken': payload.get('access_token'),
    'refreshToken': payload.get('refresh_token'),
    'expiresIn': payload.get('expires_in'),
    'expiresAt': payload.get('expires_at'),
    'tokenType': payload.get('token_type') or 'bearer',
    'user': {
      'id': user.get('id'),
      'email': user.get('email'),
    },
  })


@router.post('/register', response_model=RegisterAccountResponse)
def register_account(
  request: AccountCredentials,
  auth_client: SupabaseAuthClient = Depends(get_supabase_auth_client),
) -> RegisterAccountResponse:
  try:
    payload = auth_client.sign_up(request.email, request.password)
  except SupabaseAuthError as exc:
    raise auth_error(exc) from exc

  if isinstance(payload.get('access_token'), str):
    session = session_view(payload)
    return RegisterAccountResponse(status='SIGNED_IN', session=session, email=session.user.email)

  return RegisterAccountResponse(status='CONFIRM_EMAIL', session=None, email=request.email)


@router.post('/login', response_model=AccountSessionView)
def login_account(
  request: AccountCredentials,
  auth_client: SupabaseAuthClient = Depends(get_supabase_auth_client),
) -> AccountSessionView:
  try:
    return session_view(auth_client.sign_in(request.email, request.password))
  except SupabaseAuthError as exc:
    raise auth_error(exc) from exc


@router.post('/refresh', response_model=AccountSessionView)
def refresh_account_session(
  request: RefreshAccountSessionRequest,
  auth_client: SupabaseAuthClient = Depends(get_supabase_auth_client),
) -> AccountSessionView:
  try:
    return session_view(auth_client.refresh(request.refresh_token))
  except SupabaseAuthError as exc:
    raise auth_error(exc) from exc


@router.get('/me', response_model=AccountUserView)
def get_account(user: AuthenticatedLearner = Depends(require_learner_user)) -> AccountUserView:
  return AccountUserView(id=UUID(user.id), email=user.email)


@router.get('/progress', response_model=CourseProgressView)
def get_course_progress(
  user: AuthenticatedLearner = Depends(require_learner_user),
  repository: TrainingProgressRepository = Depends(get_progress_repository),
) -> CourseProgressView:
  try:
    row = repository.get(UUID(user.id))
  except psycopg.Error as exc:
    raise progress_dependency_error('Training progress could not be loaded.') from exc

  if row is None:
    return CourseProgressView(snapshot={}, updatedAt=None)

  updated_at = row.get('updated_at')
  return CourseProgressView(
    snapshot=dict(row.get('progress_snapshot') or {}),
    updatedAt=updated_at.isoformat() if updated_at else None,
  )


@router.put('/progress', response_model=CourseProgressView)
def update_course_progress(
  request: UpdateCourseProgressRequest,
  user: AuthenticatedLearner = Depends(require_learner_user),
  repository: TrainingProgressRepository = Depends(get_progress_repository),
) -> CourseProgressView:
  try:
    row = repository.upsert(UUID(user.id), request.snapshot)
  except psycopg.Error as exc:
    raise progress_dependency_error('Training progress could not be saved.') from exc

  updated_at = row.get('updated_at')
  return CourseProgressView(
    snapshot=dict(row.get('progress_snapshot') or {}),
    updatedAt=updated_at.isoformat() if updated_at else None,
  )
